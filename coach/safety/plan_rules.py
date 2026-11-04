"""Hard limits on a training plan. See .claude/skills/safety-rules/SKILL.md.

Plain functions. They read a plan (same shape as the plan JSON) and return violations.
They never change the plan and never fix anything.
"""
from datetime import date, timedelta

from coach.safety.violations import Violation

# Limits set by Vicky on 2026-11-02. Change only when Vicky decides, and add a decision log entry.
RAMP_WARN_PCT = 10
RAMP_FAIL_PCT = 15
RAMP_WINDOW_WEEKS = 4  # a week is compared with the highest of the previous four weeks (rule changed 2026-11-04)
LONG_RUN_CAP_KM = 32
LONG_SHARE_WARN_PCT = 45
LONG_SHARE_FAIL_PCT = 50
MIN_DAYS_NO_RUNNING = 2
MIN_DAYS_NO_RUN_NO_HEAVY = 1
MAX_QUALITY_PER_WEEK = 1
MAX_QUALITY_IN_TEST_WEEK = 2  # Vicky's choice: the test plus one quality run
HEAVY_LEG_HOURS = 72
HEAVY_SETS = 10  # a lifting session with more sets than this is heavy

# v5.1 specific. Week 2 has no clean earlier week, so it uses the average of the two weeks before it.
FIRST_WEEK_BASELINE_KM = (34.08 + 33.02) / 2
LAST_HEAVY_LEGS_IF_RECOVERED = date(2027, 3, 11)
LAST_HEAVY_LEGS_OTHERWISE = date(2027, 2, 25)
HALF_MARATHON_DATE = date(2027, 3, 7)

NO_RUN_TYPES = {"no_run", "not_recorded"}
TEST_TYPES = {"10k_test", "half_marathon_test"}
EVENT_TYPES = {"long_run", "marathon_race"} | TEST_TYPES
LEGS = "Legs + ankle/calf"
LIGHT_SESSIONS = {"", "Mobility + prehab", "unverified"}


def _weeks(plan: dict) -> list[dict]:
    """Week 1 of v5.1 is history (phase Actual), not a plan to check."""
    return [w for w in plan["weeks"] if w["phase"] != "Actual"]


def _days(week: dict) -> list[dict]:
    return week["days"]


def _distance(day: dict) -> float:
    run = day.get("run") or {}
    return 0.0 if run.get("type") in NO_RUN_TYPES else float(run.get("distance_km") or 0)


def _runs(day: dict) -> bool:
    return _distance(day) > 0


def _run_type(day: dict) -> str | None:
    return (day.get("run") or {}).get("type")


def _sets(day: dict) -> int:
    gym = day.get("gym") or {}
    return sum(int(e.get("sets") or 0) for e in gym.get("key_exercises", []))


def _heavy_lifting(day: dict) -> bool:
    gym = day.get("gym") or {}
    return gym.get("session", "") not in LIGHT_SESSIONS and _sets(day) > HEAVY_SETS


def _heavy_legs(day: dict) -> bool:
    return (day.get("gym") or {}).get("session") == LEGS and _sets(day) > HEAVY_SETS


def _week_km(week: dict) -> float:
    return round(sum(_distance(d) for d in _days(week)), 6)


def _is_race_week(week: dict) -> bool:
    return any(_run_type(d) == "marathon_race" for d in _days(week))


def _is_test_week(week: dict) -> bool:
    return any(_run_type(d) in TEST_TYPES for d in _days(week))


def check_ramp(plan: dict, first_week_baseline_km: float = FIRST_WEEK_BASELINE_KM) -> list[Violation]:
    """Each week against the highest of the previous four weeks, so a dip (a race, a recovery week) does not
    make a return to recent volume look like a spike. The first plan week uses the history baseline."""
    out = []
    history: list[float] = []
    for week in _weeks(plan):
        km = _week_km(week)
        baseline = max(history[-RAMP_WINDOW_WEEKS:]) if history else first_week_baseline_km
        if not _is_race_week(week):
            pct = round((km - baseline) / baseline * 100, 9)
            if pct > RAMP_FAIL_PCT:
                level = "fail"
            elif pct > RAMP_WARN_PCT:
                level = "warning"
            else:
                level = None
            if level:
                out.append(Violation(
                    "ramp", level, f"Week {week['week']} is {km:g} km, {pct:.1f} percent more than the "
                    f"highest of the previous {RAMP_WINDOW_WEEKS} weeks ({baseline:g} km).", week=week["week"]))
        history.append(km)
    return out


def check_long_run(plan: dict) -> list[Violation]:
    out = []
    for week in _weeks(plan):
        km = _week_km(week)
        longest = 0.0
        for d in _days(week):
            dist = _distance(d)
            longest = max(longest, dist)
            if dist > LONG_RUN_CAP_KM and _run_type(d) != "marathon_race":
                out.append(Violation("long_run_cap", "fail",
                                     f"The run on {d['date']} is {dist:g} km, above the {LONG_RUN_CAP_KM} km cap.",
                                     week=week["week"], date=d["date"]))
        half_marathon_week = any(_run_type(d) == "half_marathon_test" for d in _days(week))
        if _is_race_week(week) or half_marathon_week or km == 0:
            continue
        share = round(longest / km * 100, 9)
        if share > LONG_SHARE_FAIL_PCT:
            out.append(Violation("long_run_share", "fail",
                                 f"Week {week['week']}: the longest run is {share:.1f} percent of the week.",
                                 week=week["week"]))
        elif share > LONG_SHARE_WARN_PCT:
            out.append(Violation("long_run_share", "warning",
                                 f"Week {week['week']}: the longest run is {share:.1f} percent of the week.",
                                 week=week["week"]))
    return out


def check_rest_days(plan: dict) -> list[Violation]:
    out = []
    for week in _weeks(plan):
        days = _days(week)
        no_running = sum(1 for d in days if not _runs(d))
        full_rest = sum(1 for d in days if not _runs(d) and not _heavy_lifting(d))
        if no_running < MIN_DAYS_NO_RUNNING:
            out.append(Violation("rest_running", "fail",
                                 f"Week {week['week']} has {no_running} days with no running. "
                                 f"At least {MIN_DAYS_NO_RUNNING} are needed.", week=week["week"]))
        if full_rest < MIN_DAYS_NO_RUN_NO_HEAVY:
            out.append(Violation("rest_full", "fail",
                                 f"Week {week['week']} has no day without running and heavy lifting.",
                                 week=week["week"]))
    return out


def check_quality(plan: dict) -> list[Violation]:
    out = []
    for week in _weeks(plan):
        quality = [d for d in _days(week) if _run_type(d) == "quality" or _run_type(d) in TEST_TYPES]
        limit = MAX_QUALITY_IN_TEST_WEEK if _is_test_week(week) else MAX_QUALITY_PER_WEEK
        if len(quality) > limit:
            out.append(Violation("quality_max", "fail",
                                 f"Week {week['week']} has {len(quality)} quality sessions. The limit is {limit}.",
                                 week=week["week"]))
    return out


def check_heavy_legs(plan: dict, recovered_from_half_marathon: bool | None = None) -> list[Violation]:
    """recovered_from_half_marathon: True or False once Vicky records it, None before then."""
    out = []
    days = [d for w in _weeks(plan) for d in _days(w)]
    week_of = {d["date"]: w["week"] for w in _weeks(plan) for d in _days(w)}
    by_date = {date.fromisoformat(d["date"]): d for d in days}
    legs = sorted(k for k, d in by_date.items() if _heavy_legs(d))

    for leg in legs:
        wk = week_of[leg.isoformat()]
        for event_date, d in by_date.items():
            gap = (event_date - leg).days
            if _run_type(d) in EVENT_TYPES and 0 <= gap * 24 < HEAVY_LEG_HOURS:
                out.append(Violation("legs_gap", "fail",
                                     f"Heavy legs on {leg} are only {gap * 24} hours before the "
                                     f"{_run_type(d).replace('_', ' ')} on {event_date}.",
                                     week=wk, date=leg.isoformat()))
        next_day = by_date.get(leg + timedelta(days=1))
        if next_day and (_run_type(next_day) == "quality" or _run_type(next_day) in TEST_TYPES):
            out.append(Violation("legs_gap", "fail",
                                 f"Heavy legs on {leg}, the day before a quality run.",
                                 week=wk, date=leg.isoformat()))
        limit = LAST_HEAVY_LEGS_OTHERWISE if recovered_from_half_marathon is False else LAST_HEAVY_LEGS_IF_RECOVERED
        if leg > limit:
            out.append(Violation("legs_dates", "fail",
                                 f"Heavy legs on {leg} are after the last allowed date, {limit}.",
                                 week=wk, date=leg.isoformat()))
        elif recovered_from_half_marathon is None and leg > LAST_HEAVY_LEGS_OTHERWISE:
            out.append(Violation("legs_dates", "warning",
                                 f"Heavy legs on {leg} only stay if you recover from the half marathon on "
                                 f"{HALF_MARATHON_DATE}. Otherwise the last date is {LAST_HEAVY_LEGS_OTHERWISE}.",
                                 week=wk, date=leg.isoformat()))
    return out


def check_plan(plan: dict, recovered_from_half_marathon: bool | None = None) -> list[Violation]:
    """Run every plan rule. Fails first, then by week."""
    found = (check_ramp(plan) + check_long_run(plan) + check_rest_days(plan)
             + check_quality(plan) + check_heavy_legs(plan, recovered_from_half_marathon))
    return sorted(found, key=lambda v: (v.level != "fail", v.week or 0, v.rule))
