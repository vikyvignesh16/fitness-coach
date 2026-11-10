"""Pull runs from the COROS MCP into the runs table. Safe to run repeatedly.

Dry run by default. Pass --apply to write.
"""
import argparse
import asyncio
import json
import os
import re
from datetime import datetime, timedelta, timezone

import httpx
from dotenv import load_dotenv
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from ingest import coros_auth as auth
from ingest.coros_run_details import update_details_safely
from ingest.import_plan import find_owner

RUN_CODES = [100, 101, 102, 103]  # COROS run sport types
LIMIT = 200


def to_seconds(clock: str) -> int:
    """'46:16' or '1:24:46' to seconds."""
    parts = [int(p) for p in clock.split(":")]
    total = 0
    for p in parts:
        total = total * 60 + p
    return total


INDOOR_RUN = 101  # a treadmill session can be saved with a time and no distance


def parse_sport_records(text: str, skipped: list[dict] | None = None) -> list[dict]:
    """Turn the text from querySportRecords into run rows. Raises if the count does not match the header.

    Indoor runs saved without a distance are left out, because inventing a distance would be wrong.
    They are added to `skipped` (if given) so the caller can say so.
    """
    if text.lstrip().startswith('"'):  # COROS sends the text as a JSON string, newlines written as \n
        text = json.loads(text)
    header = re.search(r"\((\d+) records?\)", text)
    if not header:
        raise ValueError("Unexpected COROS response: no record count in the header.")
    blocks = re.split(r"(?m)^\d+\. ", text)[1:]
    if len(blocks) != int(header.group(1)):
        raise ValueError(f"COROS said {header.group(1)} records but I found {len(blocks)}.")
    runs = []
    for block in blocks:
        sport = re.search(r"SportType: (\d+)", block)
        if not sport or int(sport.group(1)) not in RUN_CODES:
            continue
        start = re.search(r"startTimestamp=(\d+)", block)
        distance = re.search(r"Distance: ([\d.]+) (km|m)\b", block)  # short ones come as metres
        duration = re.search(r"Duration: ([\d:]+)", block)
        label = re.search(r"LabelId: (\d+)", block)
        if int(sport.group(1)) == INDOOR_RUN and not distance and start and duration and label:
            if skipped is not None:
                day = re.match(r"\s*[^\n]*?(\d{4}-\d{2}-\d{2})", block)
                skipped.append({
                    "coros_id": label.group(1),
                    "date": day.group(1) if day else None,
                    "reason": "indoor run with no distance",
                })
            continue
        if not (start and distance and duration and label):
            raise ValueError("A COROS run is missing a field I need. Format may have changed.")
        hr = re.search(r"Avg HR: (\d+) bpm", block)
        runs.append({
            "coros_id": label.group(1),
            "started_at": datetime.fromtimestamp(int(start.group(1)), timezone.utc).isoformat(),
            "distance_km": float(distance.group(1)) / (1000 if distance.group(2) == "m" else 1),
            "duration_s": to_seconds(duration.group(1)),
            "avg_hr": int(hr.group(1)) if hr else None,
            "raw": {"sport_type": int(sport.group(1)), "text": block.strip()},
        })
    return runs


async def fetch_run_text(token: str, mcp_url: str, start, end) -> str:
    client = httpx.AsyncClient(headers={"Authorization": f"Bearer {token}"}, timeout=60)
    async with client, streamable_http_client(mcp_url, http_client=client) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()
            result = await session.call_tool("querySportRecords", {
                "startDate": start.strftime("%Y%m%d"),
                "endDate": end.strftime("%Y%m%d"),
                "sportTypeCodes": RUN_CODES,
                "limit": LIMIT,
            })
            if result.is_error:
                raise RuntimeError("COROS returned an error for querySportRecords.")
            return "".join(c.text for c in result.content if c.type == "text")


def save_runs(sb, owner: str, runs: list[dict]) -> None:
    rows = [{**r, "user_id": owner} for r in runs]
    if rows:
        sb.table("runs").upsert(rows, on_conflict="user_id,coros_id").execute()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    load_dotenv()
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    mcp_url = os.environ.get("COROS_MCP_URL", "https://mcpeu.coros.com/mcp")
    with httpx.Client(timeout=30) as http:
        token = auth.get_access_token(sb, http)

    end = datetime.now(timezone.utc).date()
    text = asyncio.run(fetch_run_text(token, mcp_url, end - timedelta(days=args.days), end))
    skipped: list[dict] = []
    runs = parse_sport_records(text, skipped)
    if skipped:
        print(f"Left out {len(skipped)} indoor runs saved without a distance: "
              + ", ".join(s["date"] or "?" for s in skipped))
    if len(runs) >= LIMIT:
        print(f"Warning: hit the {LIMIT} record limit. Run again with fewer days.")
    for r in sorted(runs, key=lambda r: r["started_at"]):
        print(f"{r['started_at'][:10]}  {r['distance_km']:>6.2f} km  {r['duration_s'] // 60:>3} min  HR {r['avg_hr']}")
    if not args.apply:
        print(f"Dry run: {len(runs)} runs found. Pass --apply to save.")
        return
    owner = find_owner(sb)
    save_runs(sb, owner, runs)
    print(f"Saved {len(runs)} runs.")
    print(update_details_safely(sb, owner, token, mcp_url))  # run details are a bonus and never fail this job


if __name__ == "__main__":
    main()
