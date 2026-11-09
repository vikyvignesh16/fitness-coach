"""Pull sleep, HRV, heart rate, stress, daily activity, training load, recovery and fitness from the COROS MCP
into health_daily and recovery_snapshots. Safe to run repeatedly.

Dry run by default. Pass --apply to write. Use --backfill the first time to read as much history as COROS holds.
One tool failing never stops the others. Values COROS did not give are never written, and a stored value is never blanked.
"""
import argparse
import asyncio
import os
from datetime import datetime, timedelta

import httpx
from dotenv import load_dotenv
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from ingest import coros_auth as auth
from ingest import health_parse as hp
from ingest.home_zone import HOME_ZONE
from ingest.import_plan import find_owner

REGULAR_DAYS = 3
BACKFILL_DAYS = 120
HRV_WINDOW = 7  # querySleepHrv allows at most 7 days a call

# (name, parser). The tool calls themselves are in fetch_all.
DAILY_PARSERS = {
    "sleep": hp.parse_sleep_overview,
    "hrv": hp.parse_sleep_hrv,
    "daily health": hp.parse_daily_health,
    "resting heart rate": hp.parse_resting_hr,
    "average heart rate": hp.parse_avg_hr,
    "stress": hp.parse_stress,
    "training load": hp.parse_training_load,
}


def paris_day(moment: datetime) -> str:
    return moment.astimezone(HOME_ZONE).date().isoformat()


async def _call(session, name: str, args: dict) -> str:
    result = await session.call_tool(name, args)
    if result.is_error:
        raise RuntimeError(f"COROS returned an error for {name}.")
    return "".join(c.text for c in result.content if c.type == "text")


async def fetch_all(token: str, mcp_url: str, days: int, today) -> dict:
    """Return {name: text or Exception}. HRV is a list of texts, one per 7 day window."""
    d = lambda n: (today - timedelta(days=n)).strftime("%Y%m%d")
    plan = {
        "sleep": ("querySleepOverview", {"startDate": d(days), "endDate": d(0)}),
        "daily health": ("queryDailyHealthData", {"days": days}),
        "resting heart rate": ("queryRestingHeartRate", {"days": days}),
        "average heart rate": ("queryAvgHeartRate", {"startDate": d(days), "endDate": d(0)}),
        "stress": ("queryStressLevel", {"days": days}),
        "training load": ("queryTrainingLoadAssessment", {"days": days}),
        "recovery": ("queryRecoveryStatus", {}),
        "fitness": ("queryFitnessAssessmentOverview", {}),
    }
    out: dict = {}
    client = httpx.AsyncClient(headers={"Authorization": f"Bearer {token}"}, timeout=90)
    async with client, streamable_http_client(mcp_url, http_client=client) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()
            for key, (tool, args) in plan.items():
                try:
                    out[key] = await _call(session, tool, args)
                except Exception as e:  # one tool failing must not stop the others
                    out[key] = e
            windows = []
            for start in range(days, 0, -HRV_WINDOW):
                end = max(start - HRV_WINDOW + 1, 0)
                try:
                    windows.append(await _call(session, "querySleepHrv", {"startDate": d(start), "endDate": d(end)}))
                except Exception as e:
                    windows.append(e)
            out["hrv"] = windows
    return out


def parse_all(fetched: dict) -> tuple[dict[str, dict], dict, dict, list[str]]:
    """Return (days, recovery, fitness, report lines). A failed or unreadable tool is reported and skipped."""
    report: list[str] = []
    parts: list[dict] = []
    for name, parser in DAILY_PARSERS.items():
        texts = fetched.get(name)
        texts = texts if isinstance(texts, list) else [texts]
        got: dict = {}
        failed = 0
        for text in texts:
            if text is None or isinstance(text, Exception):
                failed += 1
                continue
            try:
                got.update(parser(text))
            except ValueError as e:
                failed += 1
                report.append(f"  {name}: could not read ({e})")
        parts.append(got)
        days_text = f"{len(got)} days" + (f" ({min(got)} to {max(got)})" if got else "")
        report.append(f"  {name}: {days_text}" + (f", {failed} call(s) failed" if failed else ""))
    single = {}
    for name, parser in (("recovery", hp.parse_recovery), ("fitness", hp.parse_fitness)):
        text = fetched.get(name)
        try:
            if text is None or isinstance(text, Exception):
                raise ValueError("call failed")
            single[name] = parser(text)
            report.append(f"  {name}: ok")
        except ValueError as e:
            single[name] = {}
            report.append(f"  {name}: skipped ({e})")
    return hp.merge_days(*parts), single["recovery"], single["fitness"], report


def build_rows(days: dict[str, dict], today: str, fitness: dict) -> dict[str, dict]:
    """One row per day. A day is complete once Paris midnight has passed. Today's fitness numbers go on today's row."""
    rows = {day: {**fields, "complete": day < today} for day, fields in days.items()}
    if fitness:
        rows.setdefault(today, {"complete": False}).update(fitness)
    return rows


def save_days(sb, owner: str, rows: dict[str, dict], now: str) -> None:
    """One upsert per day, so a day only changes the columns it carries. Nothing is ever set to empty."""
    for day, fields in sorted(rows.items()):
        sb.table("health_daily").upsert(
            {"user_id": owner, "day": day, **fields, "updated_at": now},
            on_conflict="user_id,day", default_to_null=False,
        ).execute()


def save_recovery(sb, owner: str, recovery: dict, taken_at: datetime) -> dict:
    """Save this pull's recovery status and return the day's rollup for health_daily."""
    day = paris_day(taken_at)
    sb.table("recovery_snapshots").upsert({
        "user_id": owner, "taken_at": taken_at.isoformat(), "day": day, "recovery_pct": recovery["recovery_pct"],
        "level": recovery.get("level"), "full_recovery_h": recovery.get("full_recovery_h"),
    }, on_conflict="user_id,taken_at").execute()
    got = (sb.table("recovery_snapshots").select("recovery_pct").eq("user_id", owner).eq("day", day)
           .order("taken_at").execute().data)
    return hp.recovery_rollup([r["recovery_pct"] for r in got])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=REGULAR_DAYS)
    parser.add_argument("--backfill", action="store_true", help=f"read {BACKFILL_DAYS} days, as far back as COROS goes")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    days_back = BACKFILL_DAYS if args.backfill else args.days

    load_dotenv()
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    mcp_url = os.environ.get("COROS_MCP_URL", "https://mcpeu.coros.com/mcp")
    with httpx.Client(timeout=30) as http:
        token = auth.get_access_token(sb, http)

    now = datetime.now(HOME_ZONE)
    today = now.date()
    fetched = asyncio.run(fetch_all(token, mcp_url, days_back, today))
    days, recovery, fitness, report = parse_all(fetched)
    print(f"Read {days_back} days back from {today}:")
    print("\n".join(report))

    rows = build_rows(days, today.isoformat(), fitness)
    print(f"{len(rows)} days to save, {sum(1 for r in rows.values() if r['complete'])} of them finished days.")
    if recovery:
        print(f"Recovery now: {recovery['recovery_pct']}% ({recovery.get('level', 'level unknown')})")
    if not args.apply:
        print("Dry run: nothing saved. Pass --apply to save.")
        return

    owner = find_owner(sb)
    if recovery:
        rollup = save_recovery(sb, owner, recovery, now)
        rows.setdefault(today.isoformat(), {"complete": False}).update(rollup)
    save_days(sb, owner, rows, now.isoformat())
    print(f"Saved {len(rows)} days" + (" and a recovery snapshot." if recovery else "."))


if __name__ == "__main__":
    main()
