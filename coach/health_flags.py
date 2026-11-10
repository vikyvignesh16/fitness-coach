"""Facts about one day's watch numbers, worked out by code, not by the model.

The limits are the ones Vicky approved on 10 Nov 2026 for the Insights card (web/lib/insights-flags.ts).
This is a Python copy, and tests read the TypeScript file and fail if the two ever differ.
A flag states a fact about your own number. It never gives advice. The model decides what it means.
"""
LIMITS = {
    "hrvNights": 3, "rhrAbove": 5, "rhrDays": 3, "sleepMin": 360, "sleepNights": 3, "loadRatio": 1.3, "loadDays": 3,
    "stressAbove": 10, "recoveryBelow": 50, "recoveryDays": 2, "window": 7, "minNights": 5,
}

SHORT_SLEEP = "slept under 6 hours"
LOW_HRV = "HRV below your COROS normal range"
HIGH_LOAD = "short-term load more than 1.3 times long-term load"
LOW_RECOVERY = "last recovery reading under 50%"


def _num(value) -> float | None:
    return None if value is None else float(value)  # the database can hand numbers back as text


def day_flags(row: dict) -> list[str]:
    """Facts that can be checked from one day alone. Checks that need a 28 day average (resting heart rate, stress)
    or several days in a row stay on the Insights card."""
    flags = []
    if (asleep := _num(row.get("sleep_asleep_min"))) is not None and asleep < LIMITS["sleepMin"]:
        flags.append(SHORT_SLEEP)
    hrv, low = _num(row.get("hrv_avg_ms")), _num(row.get("hrv_normal_low_ms"))
    if hrv is not None and low is not None and hrv < low:
        flags.append(LOW_HRV)
    if (ratio := _num(row.get("load_ratio"))) is not None and ratio > LIMITS["loadRatio"]:
        flags.append(HIGH_LOAD)
    if (rec := _num(row.get("recovery_last"))) is not None and rec < LIMITS["recoveryBelow"]:
        flags.append(LOW_RECOVERY)
    return flags


def summarise(rows: list[dict]) -> dict:
    """Counts for the top of the tool's answer, so the model does not have to count."""
    flagged = [day_flags(r) for r in rows]
    return {
        "nights_under_6h": sum(SHORT_SLEEP in f for f in flagged),
        "nights_hrv_below_range": sum(LOW_HRV in f for f in flagged),
        "nights_with_sleep_data": sum(r.get("sleep_asleep_min") is not None for r in rows),
    }
