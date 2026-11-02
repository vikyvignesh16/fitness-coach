"""Send approved runs to the COROS watch. Runs every 5 minutes on Railway.

The web app only records Vicky's approval. This job does the sending, because it alone holds the COROS login.
COROS has no delete tool, so every step is built to avoid sending a workout twice:
  * an approval is claimed (stamped) before anything is sent, so two runs cannot both send it
  * the COROS calendar is checked for a workout with the same name first
  * a failed send is never retried by itself, and a send that crashed halfway is flagged for a human
Logs counts only, never tokens.
"""
import asyncio
import os
import re
from datetime import date, datetime, timedelta, timezone
from typing import Protocol
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from ingest import coros_auth as auth
from ingest.watch_course import CourseError, to_course

MAX_DAYS_AHEAD = 90
STALE_AFTER = timedelta(minutes=15)
LONDON = ZoneInfo("Europe/London")
_ID = re.compile(r"idInPlan\W{0,6}(\d+)")


class Db(Protocol):
    def pain_stop_active(self) -> bool: ...
    def pending(self) -> list[dict]: ...
    def stale(self, older_than: datetime) -> list[dict]: ...
    def plan_run(self, plan_version_id: str, day: str) -> dict | None: ...
    def claim(self, approval_id: str, now: datetime) -> bool: ...
    def mark_sent(self, approval_id: str, now: datetime, ref: str) -> None: ...
    def mark_failed(self, approval_id: str, error: str) -> None: ...


class Coros(Protocol):
    async def schedule_text(self, day: str) -> str: ...
    async def create_scheduled(self, day: str, course: dict) -> tuple[bool, str]: ...  # (is_error, text)


def london_today(now: datetime) -> date:
    return now.astimezone(LONDON).date()


def _ymd(day: str) -> str:
    return day.replace("-", "")


async def send_pending(db: Db, coros: Coros, now: datetime) -> dict:
    """Process every approval that has not been sent. Returns counts only."""
    counts = {"sent": 0, "already_there": 0, "failed": 0, "skipped": 0, "flagged": 0, "held": 0}

    for row in db.stale(now - STALE_AFTER):  # started, never finished: it may already be on the watch
        db.mark_failed(row["id"], "Sending stopped part way. Check the COROS app before sending again.")
        counts["flagged"] += 1

    pending = db.pending()
    if pending and db.pain_stop_active():
        # Persistent pain stops the plan (CLAUDE.md). Keep the approvals waiting, do not send and do not fail them.
        counts["held"] = len(pending)
        return counts

    today = london_today(now)
    for row in pending:
        if not db.claim(row["id"], now):
            counts["skipped"] += 1  # another run got it first
            continue
        outcome = await _send_one(db, coros, row, today, now)
        counts[outcome] += 1
    return counts


async def _send_one(db: Db, coros: Coros, row: dict, today: date, now: datetime) -> str:
    approval_id, day = row["id"], row["subject_date"]
    try:
        target = date.fromisoformat(day)
        if target < today or target > today + timedelta(days=MAX_DAYS_AHEAD):
            db.mark_failed(approval_id, "That date is outside the days COROS accepts (today to 90 days ahead).")
            return "failed"

        run = db.plan_run(row["plan_version_id"], day)
        if not run:
            db.mark_failed(approval_id, "No planned run was found for that day.")
            return "failed"
        course = to_course(run)

        # Is it already on the calendar? Our workout names carry the date, so the name is enough to tell.
        if course["courseName"] in await coros.schedule_text(_ymd(day)):
            db.mark_sent(approval_id, now, "already on the COROS calendar")
            return "already_there"

        is_error, text = await coros.create_scheduled(_ymd(day), course)
        match = _ID.search(text)
        if is_error or not match:
            snippet = " ".join(text.split())[:300]
            db.mark_failed(approval_id, f"COROS did not confirm the workout: {snippet}")
            return "failed"
        db.mark_sent(approval_id, now, match.group(1))
        return "sent"
    except CourseError as e:
        db.mark_failed(approval_id, f"Could not turn the run into a COROS workout: {e}")
        return "failed"
    except Exception as e:  # noqa: BLE001  never let one day stop the others; never log more than the type
        db.mark_failed(approval_id, f"Unexpected problem ({type(e).__name__}). Check the COROS app before trying again.")
        return "failed"


# ---- the real database and COROS behind the two interfaces

class SupabaseDb:
    def __init__(self, sb):
        self.sb = sb

    def pain_stop_active(self):
        res = self.sb.table("checkins").select("pain_stop").order("week_start", desc=True).limit(1).execute()
        return bool(res.data and res.data[0]["pain_stop"])

    def pending(self):
        return (self.sb.table("approvals").select("id, subject_date, plan_version_id")
                .eq("kind", "watch_workout").is_("sent_at", "null").is_("send_error", "null")
                .is_("send_started_at", "null").order("subject_date").execute().data)

    def stale(self, older_than):
        return (self.sb.table("approvals").select("id").eq("kind", "watch_workout").is_("sent_at", "null")
                .is_("send_error", "null").lt("send_started_at", older_than.isoformat()).execute().data)

    def plan_run(self, plan_version_id, day):
        data = (self.sb.table("plan_days").select("run").eq("plan_version_id", plan_version_id)
                .eq("date", day).maybe_single().execute())
        return data.data["run"] if data and data.data else None

    def claim(self, approval_id, now):
        """Stamp it as started, but only if nobody else has. The stamp is the lock."""
        res = (self.sb.table("approvals").update({"send_started_at": now.isoformat()})
               .eq("id", approval_id).is_("send_started_at", "null").is_("sent_at", "null").execute())
        return bool(res.data)

    def mark_sent(self, approval_id, now, ref):
        self.sb.table("approvals").update({"sent_at": now.isoformat(), "coros_ref": ref, "send_error": None}).eq("id", approval_id).execute()

    def mark_failed(self, approval_id, error):
        self.sb.table("approvals").update({"send_error": error[:500]}).eq("id", approval_id).execute()


class McpCoros:
    """One MCP connection for the whole run."""

    def __init__(self, session: ClientSession):
        self.session = session

    async def schedule_text(self, day: str) -> str:
        r = await self.session.call_tool("queryTrainingSchedule", {"startDate": day, "endDate": day})
        return "".join(c.text for c in r.content if c.type == "text")

    async def create_scheduled(self, day: str, course: dict):
        r = await self.session.call_tool("createScheduledWorkout", {"date": day, "course": course})
        return bool(r.is_error), "".join(c.text for c in r.content if c.type == "text")


async def run_job(sb, token: str, mcp_url: str) -> dict:
    db = SupabaseDb(sb)
    now = datetime.now(timezone.utc)
    if not db.pending() and not db.stale(now - STALE_AFTER):
        return {"sent": 0, "already_there": 0, "failed": 0, "skipped": 0, "flagged": 0, "held": 0}  # nothing to do: do not even connect
    client = httpx.AsyncClient(headers={"Authorization": f"Bearer {token}"}, timeout=60)
    async with client, streamable_http_client(mcp_url, http_client=client) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()
            return await send_pending(db, McpCoros(session), now)


def main() -> None:
    load_dotenv()
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    mcp_url = os.environ.get("COROS_MCP_URL", "https://mcpeu.coros.com/mcp")
    with httpx.Client(timeout=30) as http:
        token = auth.get_access_token(sb, http)
    counts = asyncio.run(run_job(sb, token, mcp_url))
    print("watch sync:", ", ".join(f"{k} {v}" for k, v in counts.items()))


if __name__ == "__main__":
    main()
