"""Tools the coach agent may ask for. Every tool is read only, checks its own inputs and returns a small flat answer.

The model never runs a tool. It asks, our code runs it. So the checks here are the real safety limit.
A tool that is given bad input returns {"error": ...} instead of crashing, so the model can read the message and try again.
"""
from datetime import date, datetime, time, timedelta, timezone
from typing import Callable

from coach.budget import HOME_TIME_ZONE
from coach.health_flags import day_flags, summarise

MAX_DAYS = 14
HEALTH_COLUMNS = (
    "day, sleep_score, sleep_asleep_min, hrv_avg_ms, hrv_label, hrv_normal_low_ms, hrv_normal_high_ms, "
    "resting_hr, stress_avg, load_ratio, load_label, recovery_last"
)

Fetch = Callable[[str, str], list[dict]]  # (first_day, last_day) -> rows, oldest first
RunsFetch = Callable[[str, str], list[dict]]  # (start, end) as UTC times -> runs, oldest first
PlanFetch = Callable[[str], dict | None]  # one date -> that plan day, or None

MAX_RUN_DAYS = 30
MAX_RUNS = 20  # the most runs one answer may hold, so a result cannot grow without limit
RUN_COLUMNS = "started_at, distance_km, duration_s, avg_hr, training_load, perceived_effort"  # never the notes: they stay private
GYM_EXERCISES_SHOWN = 10


def today_paris(now: datetime | None = None) -> str:
    return (now or datetime.now(timezone.utc)).astimezone(HOME_TIME_ZONE).date().isoformat()


def health_fetcher(sb, owner: str) -> Fetch:
    """Reads health_daily for one user. The fetcher is passed in, so tests and demos can use invented rows instead."""
    def fetch(first_day: str, last_day: str) -> list[dict]:
        return (sb.table("health_daily").select(HEALTH_COLUMNS).eq("user_id", owner)
                .gte("day", first_day).lte("day", last_day).order("day").execute().data)
    return fetch


def make_health_tool(fetch: Fetch, now: datetime | None = None):
    """Builds the get_recent_health tool. ADK reads the function's name, docstring and type hints and shows them to the model."""

    def get_recent_health(days: int) -> dict:
        """Get the runner's watch health numbers for the last few days: sleep, HRV, resting heart rate, stress,
        training load ratio and recovery. Use it for any question about sleep, recovery or how the body is coping.

        Args:
            days: How many days back to look, counting today. A whole number from 1 to 14.

        Returns:
            A dict with 'days' (one entry per day that has data, oldest first, a missing number is null; each day has
            a 'flags' list of facts the code checked, like "slept under 6 hours"), 'summary' (counts of flagged nights)
            and 'days_without_data' (how many days in the range have no watch data at all). Flags help but are not a
            complete list, so still read the numbers.
        """
        if isinstance(days, bool) or not isinstance(days, int):
            return {"error": f"days must be a whole number from 1 to {MAX_DAYS}."}
        if not 1 <= days <= MAX_DAYS:
            return {"error": f"days must be from 1 to {MAX_DAYS}, but got {days}."}
        last = today_paris(now)
        first = (datetime.fromisoformat(last) - timedelta(days=days - 1)).date().isoformat()
        rows = fetch(first, last)
        rows = [{**r, "flags": day_flags(r)} for r in rows]
        return {"days": rows, "summary": summarise(rows), "days_without_data": days - len(rows)}

    return get_recent_health


def runs_fetcher(sb, owner: str) -> RunsFetch:
    def fetch(start: str, end: str) -> list[dict]:
        return (sb.table("runs").select(RUN_COLUMNS).eq("user_id", owner)
                .gte("started_at", start).lt("started_at", end).order("started_at").execute().data)
    return fetch


def plan_fetcher(sb, owner: str) -> PlanFetch:
    """Reads one day of the newest plan version. It only reads, so plan v5.1 and later versions are never changed."""
    def fetch(day: str) -> dict | None:
        version = (sb.table("plan_versions").select("id").eq("user_id", owner).order("created_at", desc=True).limit(1).execute().data)
        if not version:
            return None
        rows = (sb.table("plan_days").select("date, run, gym").eq("plan_version_id", version[0]["id"]).eq("date", day).execute().data)
        return rows[0] if rows else None
    return fetch


def _pace(distance_km, duration_s) -> str | None:
    if not distance_km or not duration_s:
        return None
    per_km = round(duration_s / float(distance_km))
    return f"{per_km // 60}:{per_km % 60:02d} /km"


def make_runs_tool(fetch: RunsFetch, now: datetime | None = None):
    def get_recent_runs(days: int) -> dict:
        """Get the runner's recent runs from the watch: date, distance, pace, average heart rate, COROS training load
        and how the run felt. Use it for questions about what she actually ran.

        Args:
            days: How many days back to look, counting today. A whole number from 1 to 30.

        Returns:
            A dict with 'runs' (oldest first, at most the 20 most recent), 'runs_in_range' (how many there really were)
            and 'truncated' (true if some older runs were left out). A missing number is null. Notes are never included.
        """
        if isinstance(days, bool) or not isinstance(days, int):
            return {"error": f"days must be a whole number from 1 to {MAX_RUN_DAYS}."}
        if not 1 <= days <= MAX_RUN_DAYS:
            return {"error": f"days must be from 1 to {MAX_RUN_DAYS}, but got {days}."}
        last = date.fromisoformat(today_paris(now))
        start = datetime.combine(last - timedelta(days=days - 1), time.min, HOME_TIME_ZONE).astimezone(timezone.utc)
        end = datetime.combine(last + timedelta(days=1), time.min, HOME_TIME_ZONE).astimezone(timezone.utc)
        rows = fetch(start.isoformat(), end.isoformat())
        kept = rows[-MAX_RUNS:]
        runs = [{
            "date": datetime.fromisoformat(r["started_at"]).astimezone(HOME_TIME_ZONE).date().isoformat(),
            "distance_km": None if r.get("distance_km") is None else round(float(r["distance_km"]), 1),
            "pace": _pace(r.get("distance_km"), r.get("duration_s")),
            "avg_hr": r.get("avg_hr"), "training_load": r.get("training_load"), "felt": r.get("perceived_effort"),
        } for r in kept]
        return {"runs": runs, "runs_in_range": len(rows), "truncated": len(rows) > len(kept)}

    return get_recent_runs


def make_plan_day_tool(fetch: PlanFetch):
    def get_plan_day(day: str) -> dict:
        """Get what the training plan says for one date: the planned run and the planned gym session.
        Use it to compare what was planned with what she did. It is read only and cannot change the plan.

        Args:
            day: The date to look up, written YYYY-MM-DD, like 2026-11-18.

        Returns:
            A dict with 'date', 'in_plan' (false if the plan has nothing for that date), and when it does:
            'run' (type, distance_km, duration_min, pace_or_effort) and 'gym' (session and key_exercises).
        """
        if not isinstance(day, str):
            return {"error": "day must be a date written YYYY-MM-DD."}
        try:
            parsed = date.fromisoformat(day)
        except ValueError:
            return {"error": "day must be a real date written YYYY-MM-DD, like 2026-11-18."}
        row = fetch(parsed.isoformat())
        if row is None:
            return {"date": parsed.isoformat(), "in_plan": False}
        run, gym = row.get("run") or {}, row.get("gym") or {}
        return {
            "date": parsed.isoformat(), "in_plan": True,
            "run": {k: run.get(k) for k in ("type", "distance_km", "duration_min", "pace_or_effort")},
            "gym": {"session": gym.get("session"), "key_exercises": (gym.get("key_exercises") or [])[:GYM_EXERCISES_SHOWN]},
        }

    return get_plan_day
