"""Tools the coach agent may ask for. Every tool is read only, checks its own inputs and returns a small flat answer.

The model never runs a tool. It asks, our code runs it. So the checks here are the real safety limit.
A tool that is given bad input returns {"error": ...} instead of crashing, so the model can read the message and try again.
"""
from datetime import datetime, timedelta, timezone
from typing import Callable

from coach.budget import HOME_TIME_ZONE

MAX_DAYS = 14
HEALTH_COLUMNS = (
    "day, sleep_score, sleep_asleep_min, hrv_avg_ms, hrv_label, hrv_normal_low_ms, hrv_normal_high_ms, "
    "resting_hr, stress_avg, load_ratio, load_label, recovery_last"
)

Fetch = Callable[[str, str], list[dict]]  # (first_day, last_day) -> rows, oldest first


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
            A dict with 'days' (one entry per day that has data, oldest first, a missing number is null)
            and 'days_without_data' (how many days in the range have no watch data at all).
        """
        if isinstance(days, bool) or not isinstance(days, int):
            return {"error": f"days must be a whole number from 1 to {MAX_DAYS}."}
        if not 1 <= days <= MAX_DAYS:
            return {"error": f"days must be from 1 to {MAX_DAYS}, but got {days}."}
        last = today_paris(now)
        first = (datetime.fromisoformat(last) - timedelta(days=days - 1)).date().isoformat()
        rows = fetch(first, last)
        return {"days": rows, "days_without_data": days - len(rows)}

    return get_recent_health
