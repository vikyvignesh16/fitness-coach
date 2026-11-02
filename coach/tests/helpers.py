"""Small builders so each test shows only the part of the plan it cares about."""
from datetime import date, timedelta

START = date(2027, 1, 4)  # a Monday


def day(offset, run=None, km=0, session="", sets=0, week_start=START):
    d = week_start + timedelta(days=offset)
    return {
        "date": d.isoformat(),
        "run": {"type": run or "no_run", "distance_km": km if run else 0},
        "gym": {"session": session, "key_exercises": [{"name": "x", "sets": sets, "rir": 2}] if sets else []},
    }


def week(n, days, phase="Base"):
    return {"week": n, "phase": phase, "days": days}


def plan(*weeks):
    return {"weeks": list(weeks)}


def easy_week(n, km_per_run, phase="Base", start=START):
    """Mon, Wed, Fri, Sun run. Tue, Thu, Sat no running. Sat is mobility."""
    ws = start + timedelta(days=7 * (n - 1))
    return week(n, [
        day(0, "easy", km_per_run, "Chest + triceps", 20, ws),
        day(1, None, 0, "Back + biceps", 20, ws),
        day(2, "easy", km_per_run, week_start=ws),
        day(3, None, 0, "", 0, ws),
        day(4, "easy", km_per_run, week_start=ws),
        day(5, None, 0, "Mobility + prehab", 14, ws),
        day(6, "long_run", km_per_run, week_start=ws),
    ], phase)


def levels(violations, rule):
    return [v.level for v in violations if v.rule == rule]
