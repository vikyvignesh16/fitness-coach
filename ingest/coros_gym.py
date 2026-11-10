"""Pull strength sessions from COROS into strength_sessions and strength_sets. Safe to repeat.

Dry run by default. Pass --apply to write. Use --backfill the first time to read as far back as COROS goes.
Sessions are listed from querySportRecords, then each session's detail and set by set data are read. A session whose
details were never read comes first, newest first. Sessions from the last 7 days are read again after 3 hours, because
you add the effort word and your note in COROS after the session. One session failing never stops the others. A value
COROS did not give is never written as zero, and a number we hold is never blanked. Only the two fields you can edit in
COROS (effort and note) are cleared if COROS no longer has them.
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
from ingest.coros_run_details import BATCH, pick_runs
from ingest.home_zone import HOME_ZONE
from ingest.import_plan import find_owner
from ingest.run_details import EDITABLE
from ingest.strength_parse import STRENGTH, parse_strength_detail, parse_strength_records, parse_strength_sets

REGULAR_DAYS = 7
BACKFILL_DAYS = 120
LIMIT = 200


async def fetch_list(token: str, mcp_url: str, start, end) -> str:
    client = httpx.AsyncClient(headers={"Authorization": f"Bearer {token}"}, timeout=60)
    async with client, streamable_http_client(mcp_url, http_client=client) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()
            result = await session.call_tool("querySportRecords", {
                "startDate": start.strftime("%Y%m%d"), "endDate": end.strftime("%Y%m%d"), "sportTypeCodes": [STRENGTH], "limit": LIMIT,
            })
            if result.is_error:
                raise RuntimeError("COROS returned an error for querySportRecords.")
            return "".join(c.text for c in result.content if c.type == "text")


async def fetch_session_data(token: str, mcp_url: str, ids: list[str]) -> dict:
    """{coros_id: (detail text, sets text) or Exception}. Two calls per session."""
    out: dict = {}
    client = httpx.AsyncClient(headers={"Authorization": f"Bearer {token}"}, timeout=90)
    async with client, streamable_http_client(mcp_url, http_client=client) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()
            for coros_id in ids:
                try:
                    texts = []
                    for tool in ("getActivityDetail", "queryActivityLapData"):
                        r = await session.call_tool(tool, {"labelId": coros_id, "sportType": STRENGTH})
                        if r.is_error:
                            raise RuntimeError(f"COROS returned an error for {tool}.")
                        texts.append("".join(c.text for c in r.content if c.type == "text"))
                    out[coros_id] = (texts[0], texts[1])
                except Exception as e:  # one session failing must not stop the others
                    out[coros_id] = e
    return out


def save_sessions(sb, owner: str, sessions: list[dict]) -> None:
    """One upsert per session, carrying only the columns COROS gave."""
    for s in sessions:
        row = {k: v for k, v in s.items() if v is not None}
        sb.table("strength_sessions").upsert({**row, "user_id": owner}, on_conflict="user_id,coros_id", default_to_null=False).execute()


def session_update(detail: dict, now: str) -> dict:
    """The columns to update. Empty values are left out, except the two you can edit in COROS, which are cleared."""
    row = {k: v for k, v in detail.items() if v is not None or k in EDITABLE}
    row["detail_fetched_at"] = now
    return row


def save_sets(sb, owner: str, session_id: str, sets: list[dict]) -> None:
    """Upsert the sets by position, then remove any positions past the end, so a shorter session leaves no leftovers."""
    for s in sets:
        sb.table("strength_sets").upsert({**s, "user_id": owner, "session_id": session_id}, on_conflict="session_id,position", default_to_null=False).execute()
    sb.table("strength_sets").delete().eq("session_id", session_id).gt("position", len(sets)).execute()


def save_one(sb, owner: str, coros_id: str, detail: dict, sets: list[dict], now: str) -> None:
    found = sb.table("strength_sessions").select("id").eq("user_id", owner).eq("coros_id", coros_id).execute().data
    if not found:
        raise ValueError("session not saved yet")
    # The sets go first and the "details read" stamp goes last. If saving the sets fails, the session is not stamped,
    # so the next run tries it again instead of treating a half saved session as finished.
    save_sets(sb, owner, found[0]["id"], sets)
    sb.table("strength_sessions").update(session_update(detail, now)).eq("id", found[0]["id"]).execute()


def run_job(sb, owner: str, fetched: dict, now: datetime, apply: bool) -> dict:
    """Parse what was fetched and (with apply) save it. Never returns any note text."""
    done = failed = n_sets = notes = 0
    errors: set[str] = set()
    words: dict[str, set] = {"perceived_effort": set(), "training_focus": set()}
    for coros_id, texts in fetched.items():
        try:
            if isinstance(texts, Exception):
                raise ValueError("call failed")
            detail = parse_strength_detail(texts[0])
            sets = parse_strength_sets(texts[1])
        except (ValueError, KeyError, TypeError):
            failed += 1
            continue
        for key in words:
            if detail.get(key):
                words[key].add(detail[key])
        notes += 1 if detail.get("workout_note") else 0
        if apply:
            try:
                save_one(sb, owner, coros_id, detail, sets, now.isoformat())
            except Exception as e:  # noqa: BLE001 - one session the database rejects must not stop the others
                failed += 1
                errors.add(type(e).__name__)  # the type only: the details could hold your note or numbers
                continue
        done += 1
        n_sets += len(sets)
    return {"read": done, "failed": failed, "sets": n_sets, "with_note": notes, "errors": sorted(errors),
            "words": {k: sorted(v) for k, v in words.items()}}


def load_sessions(sb) -> list[dict]:
    rows = sb.table("strength_sessions").select("coros_id, started_at, detail_fetched_at").execute().data
    return [{**r, "sport_type": STRENGTH} for r in rows]


def update_gym(sb, owner: str, token: str, mcp_url: str, days: int = REGULAR_DAYS, limit: int = BATCH, apply: bool = True) -> dict:
    now = datetime.now(timezone.utc)
    today = now.astimezone(HOME_ZONE).date()
    sessions = parse_strength_records(asyncio.run(fetch_list(token, mcp_url, today - timedelta(days=days), today)))
    if apply:
        save_sessions(sb, owner, sessions)
        known = load_sessions(sb)
    else:  # a dry run has nothing saved to pick from, so it reads what the list shows
        known = [{"coros_id": s["coros_id"], "started_at": s["started_at"], "detail_fetched_at": None, "sport_type": STRENGTH} for s in sessions]
    ids = [i for i, _ in pick_runs(known, now, limit)]
    fetched = asyncio.run(fetch_session_data(token, mcp_url, ids)) if ids else {}
    report = run_job(sb, owner, fetched, now, apply)
    return {**report, "listed": len(sessions)}


def update_gym_safely(sb, owner: str, token: str, mcp_url: str) -> str:
    """For the 15 minute runs job. Whatever goes wrong here, the runs job must still finish, so this never raises."""
    try:
        r = update_gym(sb, owner, token, mcp_url)
        return f"Gym: listed {r['listed']}, read {r['read']} ({r['sets']} sets), {r['failed']} failed."
    except Exception as e:  # noqa: BLE001 - gym data is a bonus, runs are the job
        return f"Gym skipped ({type(e).__name__})."


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=REGULAR_DAYS)
    parser.add_argument("--backfill", action="store_true", help=f"read {BACKFILL_DAYS} days, as far back as COROS goes")
    parser.add_argument("--limit", type=int, default=BATCH)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    load_dotenv()
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    mcp_url = os.environ.get("COROS_MCP_URL", "https://mcpeu.coros.com/mcp")
    with httpx.Client(timeout=30) as http:
        token = auth.get_access_token(sb, http)
    r = update_gym(sb, find_owner(sb), token, mcp_url, BACKFILL_DAYS if args.backfill else args.days, args.limit, args.apply)
    print(f"Listed {r['listed']} strength sessions. Read {r['read']} of them ({r['sets']} sets, {r['failed']} failed, {r['with_note']} with a note).")
    if r["errors"]:
        print(f"  could not save: {', '.join(r['errors'])}")
    for key, seen in r["words"].items():
        print(f"  {key}: {', '.join(seen) or 'none'}")
    print("Saved." if args.apply else "Dry run: nothing saved. Pass --apply to save.")


if __name__ == "__main__":
    main()
