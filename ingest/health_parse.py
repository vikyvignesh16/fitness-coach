"""Turn the text the COROS health tools send into rows for health_daily and recovery_snapshots.

Every parser takes the text of one tool and returns {day: {column: value}} with only the values COROS really gave.
"No data" and a missing night are left out, never turned into zero. A format we do not recognise raises, so a change
on COROS's side stops the job loudly instead of saving wrong numbers. Formats were checked on 2026-11-09 (coros-mcp skill).
"""
import json
import re
from datetime import datetime

from ingest.home_zone import HOME_ZONE

DAY_LINE = re.compile(r"^(\d{4}-\d{2}-\d{2}):?\s*$", re.M)
DURATION = r"((?:\d+\s*h\s*)?(?:\d+\s*min)?)"


def unwrap(text: str) -> str:
    """COROS sends the text as a JSON string, newlines written as \\n."""
    return json.loads(text) if text.lstrip().startswith('"') else text


def expect(text: str, title: str) -> None:
    if title not in text[:200]:
        raise ValueError(f"Unexpected COROS response: expected '{title}' at the start.")


def minutes(clock: str) -> int:
    """'8h 8min', '29 min', '27min' or '1h' to minutes."""
    m = re.fullmatch(r"\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?\s*", clock)
    if not m or not (m.group(1) or m.group(2)):
        raise ValueError(f"Unexpected COROS duration: {clock!r}")
    return int(m.group(1) or 0) * 60 + int(m.group(2) or 0)


def clock_seconds(clock: str) -> int:
    """'3:57' (minutes and seconds) or '1:26:36' (hours, minutes, seconds) to seconds."""
    parts = clock.strip().split(" ")[0].split(":")
    if len(parts) not in (2, 3) or not all(p.isdigit() for p in parts):
        raise ValueError(f"Unexpected COROS time: {clock!r}")
    total = 0
    for p in parts:
        total = total * 60 + int(p)
    return total


def day_blocks(text: str) -> dict[str, str]:
    """Split text that has a 'yyyy-mm-dd' (or 'yyyy-mm-dd:') line above each day's lines."""
    found = list(DAY_LINE.finditer(text))
    return {
        m.group(1): text[m.end(): found[i + 1].start() if i + 1 < len(found) else len(text)]
        for i, m in enumerate(found)
    }


def _local_time(stamp: str) -> str:
    return datetime.strptime(stamp, "%Y-%m-%d %H:%M").replace(tzinfo=HOME_ZONE).isoformat()


def parse_sleep_overview(text: str) -> dict[str, dict]:
    text = unwrap(text)
    expect(text, "Sleep Overview")
    days: dict[str, dict] = {}
    for day, body in day_blocks(text).items():
        if "not available yet" in body:  # COROS writes "Sleep Score: 0" for these, which is not a score
            continue
        score = re.search(r"^Sleep Score: (-?\d+)", body, re.M)
        if not score:
            raise ValueError(f"Sleep overview for {day} has no Sleep Score line.")
        row: dict = {}
        if int(score.group(1)) > 0:  # a score of 0 or below means COROS had nothing to score
            row["sleep_score"] = int(score.group(1))
        for column, label in (
            ("sleep_total_min", r"Daily Sleep"),
            ("sleep_asleep_min", r"Main Sleep \(asleep\)"),
            ("sleep_period_min", r"Main Sleep Period \(incl\. awake\)"),
            ("sleep_awake_min", r"Awake Time"),
            ("sleep_nap_min", r"Naps Total(?: \(asleep\))?"),
        ):
            m = re.search(rf"^{label}: {DURATION}", body, re.M)
            if m and m.group(1).strip():
                row[column] = minutes(m.group(1))
        window = re.search(r"^Main Sleep Window: (\S+ \S+) - (\S+ \S+)", body, re.M)
        if window:
            row["sleep_start"], row["sleep_end"] = _local_time(window.group(1)), _local_time(window.group(2))
        if not ({"sleep_total_min", "sleep_asleep_min", "sleep_period_min"} & row.keys()):
            raise ValueError(f"Sleep overview for {day} has a score but no sleep times. Format may have changed.")
        days[day] = row
    return days


def parse_sleep_hrv(text: str) -> dict[str, dict]:
    text = unwrap(text)
    expect(text, "Sleep HRV")
    assessment = text.split("Sleep HRV Time Series")[0]  # the raw 10 minute points after it are not used
    days: dict[str, dict] = {}
    for day, body in day_blocks(assessment).items():
        if "No data" in body:
            continue
        avg = re.search(r"HRV Avg: (\d+) ms(?: — (.+))?", body)
        if not avg:
            raise ValueError(f"HRV for {day} has no 'HRV Avg' line.")
        row: dict = {"hrv_avg_ms": int(avg.group(1))}
        if avg.group(2):
            row["hrv_label"] = avg.group(2).strip()
        normal = re.search(r"Normal Range: (\d+) - (\d+) ms", body)
        if normal:
            row["hrv_normal_low_ms"], row["hrv_normal_high_ms"] = int(normal.group(1)), int(normal.group(2))
        baseline = re.search(r"Baseline: (\d+) ms", body)
        if baseline:
            row["hrv_baseline_ms"] = int(baseline.group(1))
        days[day] = row
    return days


def parse_daily_health(text: str) -> dict[str, dict]:
    text = unwrap(text)
    expect(text, "Daily Health Data")
    found = list(re.finditer(r"^--- (\d{4})(\d{2})(\d{2}) ---$", text, re.M))
    days: dict[str, dict] = {}
    for i, m in enumerate(found):
        day = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
        body = text[m.end(): found[i + 1].start() if i + 1 < len(found) else len(text)]
        row: dict = {}
        activity = re.search(r"Steps: ([\d,]+) \| Calories: ([\d,]+) kcal \| Exercise: (.+)", body)
        stress = re.search(r"^Stress: Avg (\d+)", body, re.M)
        if not activity:
            raise ValueError(f"Daily health for {day} has no Steps line.")
        steps, kcal = int(activity.group(1).replace(",", "")), int(activity.group(2).replace(",", ""))
        exercise = minutes(activity.group(3))
        if steps or kcal or exercise or stress:  # all zero and no stress means the watch recorded nothing
            row.update(steps=steps, calories_kcal=kcal, exercise_min=exercise)
        if stress:
            row["stress_avg"] = int(stress.group(1))
        stages = re.search(r"Total: (.+?) \| Deep: (.+?) \| Light: (.+?) \| REM: (.+?) \| Awake: (.+)", body)
        if stages:
            row.update(
                sleep_deep_min=minutes(stages.group(2)), sleep_light_min=minutes(stages.group(3)),
                sleep_rem_min=minutes(stages.group(4)), sleep_awake_min=minutes(stages.group(5)),
            )
        sleep_hr = re.search(r"Sleep HR: Avg (\d+) bpm \| Min (\d+) bpm \| Max (\d+) bpm", body)
        if sleep_hr:
            row.update(sleep_hr_avg=int(sleep_hr.group(1)), sleep_hr_min=int(sleep_hr.group(2)), sleep_hr_max=int(sleep_hr.group(3)))
        if row:
            days[day] = row
    return days


def _day_lines(text: str):
    for m in re.finditer(r"^(\d{4}-\d{2}-\d{2}): (.+)$", text, re.M):
        yield m.group(1), m.group(2).strip()


def parse_resting_hr(text: str) -> dict[str, dict]:
    text = unwrap(text)
    expect(text, "Resting Heart Rate")
    days: dict[str, dict] = {}
    for day, rest in _day_lines(text):
        if rest == "No data":
            continue
        m = re.fullmatch(r"(\d+) bpm", rest)
        if not m:
            raise ValueError(f"Unexpected resting heart rate line for {day}: {rest!r}")
        days[day] = {"resting_hr": int(m.group(1))}
    return days


def parse_avg_hr(text: str) -> dict[str, dict]:
    text = unwrap(text)
    expect(text, "Average Heart Rate")
    days: dict[str, dict] = {}
    for day, rest in _day_lines(text):
        if rest == "No data":
            continue
        m = re.fullmatch(r"(\d+) bpm \(Min: (\d+), Max: (\d+)\)", rest)
        if not m:
            raise ValueError(f"Unexpected average heart rate line for {day}: {rest!r}")
        days[day] = {"hr_avg": int(m.group(1)), "hr_min": int(m.group(2)), "hr_max": int(m.group(3))}
    return days


def parse_stress(text: str) -> dict[str, dict]:
    text = unwrap(text)
    expect(text, "Stress Level")
    days: dict[str, dict] = {}
    for day, body in day_blocks(text).items():
        m = re.search(r"Average Stress: (\d+|No data)", body)
        if not m:
            raise ValueError(f"Stress for {day} has no 'Average Stress' line.")
        if m.group(1) != "No data":
            days[day] = {"stress_avg": int(m.group(1))}
    return days


def parse_training_load(text: str) -> dict[str, dict]:
    text = unwrap(text)
    expect(text, "Training Load Assessment")
    days: dict[str, dict] = {}
    for day, body in day_blocks(text).items():
        short = re.search(r"Short-Term Load: (\d+)", body)
        long_ = re.search(r"Long-Term Load: (\d+)", body)
        ratio = re.search(r"Load Ratio: ([\d.]+)", body)
        comment = re.search(r"Comment: (.+)", body)
        if not (short and long_ and ratio):
            raise ValueError(f"Training load for {day} is missing a number. Format may have changed.")
        row = {"load_short": int(short.group(1)), "load_long": int(long_.group(1)), "load_ratio": float(ratio.group(1))}
        if comment:
            row["load_label"] = comment.group(1).strip()
        days[day] = row
    return days


def parse_recovery(text: str) -> dict:
    """Today's recovery status. Returns {recovery_pct, level, full_recovery_h}."""
    text = unwrap(text)
    expect(text, "Recovery Status")
    pct = re.search(r"^Recovery: (\d+)%", text, re.M)
    if not pct:
        raise ValueError("Recovery status has no 'Recovery' percentage. Format may have changed.")
    out: dict = {"recovery_pct": int(pct.group(1))}
    level = re.search(r"^Level: (.+)$", text, re.M)
    if level:
        out["level"] = level.group(1).strip()
    full = re.search(r"^Estimated Full Recovery: (.+)$", text, re.M)
    if full:
        d, h = re.search(r"(\d+)\s*d", full.group(1)), re.search(r"(\d+)\s*h", full.group(1))
        if d or h:
            out["full_recovery_h"] = int(d.group(1) if d else 0) * 24 + int(h.group(1) if h else 0)
    return out


def parse_fitness(text: str) -> dict:
    """Today's fitness overview as health_daily columns. Times are seconds."""
    text = unwrap(text)
    expect(text, "Fitness Assessment Overview")
    vo2 = re.search(r"^VO2max: ([\d.]+)", text, re.M)
    if not vo2:
        raise ValueError("Fitness overview has no VO2max. Format may have changed.")
    out: dict = {"vo2max": float(vo2.group(1))}
    level = re.search(r"^Running Level: ([\d.]+)", text, re.M)
    if level:
        out["running_level"] = float(level.group(1))
    for column, label in (
        ("threshold_pace_s", "Threshold Pace"),
        ("pred_5k_s", "5 km Prediction"),
        ("pred_10k_s", "10 km Prediction"),
        ("pred_half_s", "Half Marathon Prediction"),
        ("pred_marathon_s", "Marathon Prediction"),
    ):
        m = re.search(rf"^{label}: ([\d:]+)", text, re.M)
        if m:
            out[column] = clock_seconds(m.group(1))
    return out


def merge_days(*parts: dict[str, dict]) -> dict[str, dict]:
    """Combine parser results by day. A later value replaces an earlier one. Nothing is ever set to empty."""
    merged: dict[str, dict] = {}
    for part in parts:
        for day, row in part.items():
            merged.setdefault(day, {}).update({k: v for k, v in row.items() if v is not None})
    return merged


def recovery_rollup(percents: list[int]) -> dict:
    """Average, lowest, highest and last of a day's recovery snapshots, given in time order."""
    if not percents:
        return {}
    return {
        "recovery_avg": round(sum(percents) / len(percents), 1),
        "recovery_min": min(percents),
        "recovery_max": max(percents),
        "recovery_last": percents[-1],
    }
