"""Turn COROS strength data into rows for strength_sessions and strength_sets.

Three texts are read: the list from querySportRecords, the detail from getActivityDetail, and the set by set data from
queryActivityLapData. Checked on 2026-11-10 with two real sessions (coros-mcp skill). A format we do not recognise
raises, so a change on COROS's side stops the job loudly. A value COROS did not give is left empty, never zero.
"""
import json
import re
from datetime import datetime, timezone

from ingest.home_zone import HOME_ZONE
from ingest.run_details import parse_activity_detail

STRENGTH = 402
NOT_EXERCISES = {"Warm Up", "Cool Down", "Rest"}  # rows that are phases of the workout, not lifts


def _unwrap(text: str) -> str:
    return json.loads(text) if text.lstrip().startswith('"') else text


def _clock_seconds(clock: str) -> int:
    parts = [int(p) for p in clock.strip().split(":")]
    total = 0
    for p in parts:
        total = total * 60 + p
    return total


def parse_strength_records(text: str) -> list[dict]:
    """Strength sessions from querySportRecords. Other sports in the same answer are skipped."""
    text = _unwrap(text)
    header = re.search(r"\((\d+) records?\)", text)
    if not header:
        raise ValueError("Unexpected COROS response: no record count in the header.")
    blocks = re.split(r"(?m)^\d+\. ", text)[1:]
    if len(blocks) != int(header.group(1)):
        raise ValueError(f"COROS said {header.group(1)} records but I found {len(blocks)}.")
    sessions = []
    for block in blocks:
        sport = re.search(r"SportType: (\d+)", block)
        if not sport or int(sport.group(1)) != STRENGTH:
            continue
        start = re.search(r"startTimestamp=(\d+)", block)
        duration = re.search(r"Duration: ([\d:]+)", block)
        label = re.search(r"LabelId: (\d+)", block)
        if not (start and duration and label):
            raise ValueError("A COROS strength session is missing a field I need. Format may have changed.")
        started = datetime.fromtimestamp(int(start.group(1)), timezone.utc)
        name = re.search(r"^\s*Location: (.+)$", block, re.M)
        sets = re.search(r"Sets: (\d+)", block)
        hr = re.search(r"Avg HR: (\d+) bpm", block)
        kcal = re.search(r"Calories: (\d+) kcal", block)
        sessions.append({
            "coros_id": label.group(1),
            "started_at": started.isoformat(),
            "day": started.astimezone(HOME_ZONE).date().isoformat(),
            "workout_name": name.group(1).strip() if name else None,
            "duration_s": _clock_seconds(duration.group(1)),
            "sets_count": int(sets.group(1)) if sets else None,
            "avg_hr": int(hr.group(1)) if hr else None,
            "calories": int(kcal.group(1)) if kcal else None,
        })
    return sessions


def _duration(text: str, label: str) -> int | None:
    m = re.search(rf"^{label}: ([\d:]+)\s*$", text, re.M)
    return _clock_seconds(m.group(1)) if m else None


def parse_strength_detail(text: str) -> dict:
    """Details of one strength session, as strength_sessions columns. Reads like the run details, plus times and sets."""
    text = _unwrap(text)
    base = parse_activity_detail(text)  # raises if this is not an activity detail
    sets = re.search(r"^Sets: (\d+)", text, re.M)
    return {
        "training_load": base["training_load"], "aerobic_te": base["aerobic_te"], "anaerobic_te": base["anaerobic_te"],
        "training_focus": base["training_focus"], "perceived_effort": base["perceived_effort"], "workout_note": base["workout_note"],
        "duration_s": _duration(text, "Workout Time"), "total_time_s": _duration(text, "Total Time"),
        "sets_count": int(sets.group(1)) if sets else None,
    }


def parse_strength_sets(text: str) -> list[dict]:
    """The sets of one session, in order. Skips warm up, cool down and rest rows.

    COROS writes one row per set, then one extra summary row per exercise holding the total reps and the total weight
    lifted. The summary is dropped only after checking that it adds up, so a set is never counted twice and a real
    set is never dropped by mistake. Weights come in grams.
    """
    data = json.loads(_unwrap(text))
    if not isinstance(data, dict) or "columns" not in data or not data.get("lapGroups"):
        raise ValueError("Unexpected COROS response: no set by set data.")
    columns = [c["name"] for c in data["columns"]]
    for needed in ("exerciseNameKey", "reps", "weight"):
        if needed not in columns:
            raise ValueError(f"The set data has no '{needed}' column. Format may have changed.")
    laps = data["lapGroups"][0]["laps"]

    blocks: list[list[dict]] = []
    for lap in laps:
        name = (lap.get("exerciseNameKey") or "").strip()
        if not name or name in NOT_EXERCISES:
            blocks.append([])  # a break between exercises
            continue
        if not blocks or not blocks[-1] or blocks[-1][0]["name"] != name:
            blocks.append([])
        blocks[-1].append({"name": name, "reps": int(lap.get("reps") or 0), "weight_g": lap.get("weight") or 0, "lap": lap})

    sets: list[dict] = []
    for block in blocks:
        work = [r for r in block if r["reps"] > 0]
        if len(work) >= 2:
            *rest, last = work
            if last["reps"] == sum(r["reps"] for r in rest) and last["weight_g"] == sum(r["weight_g"] * r["reps"] for r in rest):
                work = rest  # the summary row adds up, so it is the total and not a set
        for r in work:
            lap = r["lap"]
            sets.append({
                "position": len(sets) + 1,
                "exercise": r["name"],
                "reps": r["reps"],
                "weight_kg": round(r["weight_g"] / 1000, 2) if r["weight_g"] else None,  # no weight means body weight
                "seconds": lap.get("time"),
                "avg_hr": lap.get("avgHr") or None,
                "max_hr": lap.get("maxHr") or None,
            })
    return sets
