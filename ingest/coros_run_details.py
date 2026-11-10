"""Read each run's details from COROS (getActivityDetail) and save them on the runs table. Safe to repeat.

Dry run by default. Pass --apply to write. Runs whose details were never read come first, newest first. Runs from the
last 7 days are read again after 3 hours, because you add the effort word and your note in COROS after the run.
One run failing never stops the others. A field COROS does not have is never written as zero, and a number we already
hold is never blanked. Only the two fields you can edit in COROS (effort and note) are cleared if COROS no longer has them.
"""
import argparse
import asyncio
import os
from datetime import datetime, timedelta, timezone

import httpx
from dotenv import load_dotenv
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from ingest import coros_auth as auth
from ingest.import_plan import find_owner
from ingest.run_details import EDITABLE, parse_activity_detail

BATCH = 15
RECENT = timedelta(days=7)
REFETCH_AFTER = timedelta(hours=3)
DEFAULT_SPORT = 100  # outdoor run


def pick_runs(runs: list[dict], now: datetime, limit: int) -> list[tuple[str, int]]:
    """Which runs to read now, as (coros_id, sport type). Never read first, newest first. Then recent ones that are stale."""
    never = sorted((r for r in runs if not r["detail_fetched_at"]), key=lambda r: r["started_at"], reverse=True)
    stale = sorted(
        (r for r in runs
         if r["detail_fetched_at"]
         and datetime.fromisoformat(r["started_at"]) > now - RECENT
         and datetime.fromisoformat(r["detail_fetched_at"]) < now - REFETCH_AFTER),
        key=lambda r: r["detail_fetched_at"],
    )
    return [(r["coros_id"], int(r.get("sport_type") or DEFAULT_SPORT)) for r in (never + stale)[:limit]]


async def fetch_details(token: str, mcp_url: str, items: list[tuple[str, int]]) -> dict:
    """{coros_id: text or Exception}. One session, one call per run."""
    out: dict = {}
    client = httpx.AsyncClient(headers={"Authorization": f"Bearer {token}"}, timeout=90)
    async with client, streamable_http_client(mcp_url, http_client=client) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()
            for coros_id, sport in items:
                try:
                    result = await session.call_tool("getActivityDetail", {"labelId": coros_id, "sportType": sport})
                    if result.is_error:
                        raise RuntimeError("COROS returned an error for getActivityDetail.")
                    out[coros_id] = "".join(c.text for c in result.content if c.type == "text")
                except Exception as e:  # one run failing must not stop the others
                    out[coros_id] = e
    return out


def row_for_save(parsed: dict, now: str) -> dict:
    """The columns to write. Empty values are left out, except the two you can edit in COROS, which are cleared."""
    row = {k: v for k, v in parsed.items() if v is not None or k in EDITABLE}
    row["detail_fetched_at"] = now
    return row


def save_details(sb, owner: str, coros_id: str, parsed: dict, now: str) -> None:
    sb.table("runs").update(row_for_save(parsed, now)).eq("user_id", owner).eq("coros_id", coros_id).execute()


def load_runs(sb) -> list[dict]:
    rows = sb.table("runs").select("coros_id, started_at, detail_fetched_at, raw").execute().data
    return [{**r, "sport_type": (r.get("raw") or {}).get("sport_type")} for r in rows]


def run_job(sb, owner: str, fetched_for: dict, now: datetime, apply: bool) -> dict:
    """Parse what was fetched and (with apply) save it. Returns counts and the words seen, never any note text."""
    saved, failed = 0, 0
    words: dict[str, set] = {"perceived_effort": set(), "training_focus": set(), "performance": set()}
    notes = 0
    for coros_id, text in fetched_for.items():
        try:
            if isinstance(text, Exception):
                raise ValueError("call failed")
            parsed = parse_activity_detail(text)
        except ValueError:
            failed += 1
            continue
        for key in words:
            if parsed.get(key):
                words[key].add(parsed[key])
        notes += 1 if parsed.get("workout_note") else 0
        if apply:
            save_details(sb, owner, coros_id, parsed, now.isoformat())
        saved += 1
    return {"read": saved, "failed": failed, "with_note": notes, "words": {k: sorted(v) for k, v in words.items()}}


def update_details(sb, owner: str, token: str, mcp_url: str, limit: int = BATCH, apply: bool = True) -> dict:
    now = datetime.now(timezone.utc)
    items = pick_runs(load_runs(sb), now, limit)
    if not items:
        return {"read": 0, "failed": 0, "with_note": 0, "words": {}, "waiting": 0}
    fetched = asyncio.run(fetch_details(token, mcp_url, items))
    return run_job(sb, owner, fetched, now, apply)


def update_details_safely(sb, owner: str, token: str, mcp_url: str) -> str:
    """For the 15 minute runs job. Whatever goes wrong here, the runs job must still finish, so this never raises."""
    try:
        r = update_details(sb, owner, token, mcp_url)
        return f"Run details: read {r['read']}, {r['failed']} failed."
    except Exception as e:  # noqa: BLE001 - details are a bonus, runs are the job
        return f"Run details skipped ({type(e).__name__})."


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=BATCH)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    load_dotenv()
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    mcp_url = os.environ.get("COROS_MCP_URL", "https://mcpeu.coros.com/mcp")
    with httpx.Client(timeout=30) as http:
        token = auth.get_access_token(sb, http)
    waiting = len([r for r in load_runs(sb) if not r["detail_fetched_at"]])
    report = update_details(sb, find_owner(sb), token, mcp_url, args.limit, args.apply)
    print(f"Read {report['read']} runs ({report['failed']} failed, {report['with_note']} with a note). {waiting} runs had no details before this.")
    for key, seen in report["words"].items():
        print(f"  {key}: {', '.join(seen) or 'none'}")
    print("Saved." if args.apply else "Dry run: nothing saved. Pass --apply to save.")


if __name__ == "__main__":
    main()
