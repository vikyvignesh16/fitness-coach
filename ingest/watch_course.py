"""Turn one planned run from plan v5.1 into the workout format the COROS MCP accepts.

Pure functions. Nothing here talks to COROS or the database.
COROS section codes (from the createScheduledWorkout tool description, checked 2026-11-02):
  sectionType: 1 warm up, 2 training, 3 recovery, 4 cool down
  targetType:  1 distance in metres, 2 time in seconds, 4 free (athlete presses the lap button)
  intensityType 2: pace, with intensityValueStart and intensityValueEnd in seconds per km (120 to 1499)
"""
import re

RUNNING = 1
WARM_UP, TRAINING, RECOVERY, COOL_DOWN = 1, 2, 3, 4
DISTANCE, TIME, FREE = 1, 2, 4
PACE = 2
PACE_MIN_S, PACE_MAX_S = 120, 1499
MAX_NAME = 100
MAX_REPEATS = 20

_PACE_TOKEN = re.compile(r"(\d{1,2}):(\d{2})")


class CourseError(ValueError):
    """A planned run that cannot be turned into a COROS workout. Better to stop than send a wrong one."""


def parse_pace_range(text: str | None) -> tuple[int, int] | None:
    """'5:50–6:25' becomes (350, 385) seconds per km, fastest first. Extra words after the times are ignored."""
    if not text:
        return None
    times = [int(m) * 60 + int(s) for m, s in _PACE_TOKEN.findall(text)]
    if len(times) < 2:
        raise CourseError(f"Expected a pace range like 5:50 to 6:25, got: {text!r}")
    lo, hi = sorted(times[:2])
    if lo == hi or lo < PACE_MIN_S or hi > PACE_MAX_S:
        raise CourseError(f"Pace {text!r} is outside what COROS accepts ({PACE_MIN_S} to {PACE_MAX_S} seconds per km)")
    return lo, hi


def _target(part: dict) -> dict:
    """How long a step lasts: a distance, a time, or until the athlete presses lap."""
    if part.get("distance_km") is not None:
        metres = round(float(part["distance_km"]) * 1000)
        if metres <= 0:
            raise CourseError("A step has no distance")
        return {"targetType": DISTANCE, "targetValue": metres}
    minutes = part.get("duration_min")
    if isinstance(minutes, (int, float)):
        return {"targetType": TIME, "targetValue": round(minutes * 60)}
    if part.get("duration_sec") is not None:
        return {"targetType": TIME, "targetValue": round(part["duration_sec"])}
    if isinstance(minutes, str):  # "until planned total distance": the athlete ends it with the lap button
        return {"targetType": FREE}
    raise CourseError(f"A step has no distance or time: {part!r}")


def _intensity(part: dict) -> dict:
    pace = parse_pace_range(part.get("pace_min_per_km"))
    if pace is None:  # effort only: no target, the effort goes in the description
        return {}
    return {"intensityType": PACE, "intensityValueStart": pace[0], "intensityValueEnd": pace[1]}


def _is_off_record(step: dict) -> bool:
    """A warm up or cool down with 0 km: walking or drills that are not part of the run."""
    return step.get("distance_km") == 0 and bool(step.get("effort"))


def _section(part: dict, section_type: int) -> dict:
    return {"sectionType": section_type, **_target(part), **_intensity(part)}


def _amount(part: dict) -> str:
    if part.get("distance_km") is not None:
        return f"{part['distance_km']:g} km"
    if isinstance(part.get("duration_min"), (int, float)):
        return f"{part['duration_min']:g} min"
    if part.get("duration_sec") is not None:
        return f"{part['duration_sec']:g} sec"
    return "until the planned distance"


def _words(part: dict) -> str:
    bits = [_amount(part)]
    pace = parse_pace_range(part.get("pace_min_per_km"))
    if pace:
        bits.append(f"at {pace[0] // 60}:{pace[0] % 60:02d} to {pace[1] // 60}:{pace[1] % 60:02d} per km")
    if part.get("effort"):
        bits.append(f"({part['effort']})")
    return " ".join(bits)


def to_course(run: dict, name: str | None = None) -> dict:
    """Build the `course` for createScheduledWorkout from one planned run (a plan_days.run block)."""
    plan = run.get("coros_workout") or {}
    steps = plan.get("steps") or []
    if not steps:
        raise CourseError("The planned run has no steps")

    sections, text = [], []
    for step in steps:
        kind = step.get("step")
        if kind == "run":
            sections.append(_section(step, TRAINING))
            text.append(f"Run {_words(step)}.")
        elif kind in ("warm_up", "cool_down"):
            label = "Warm up" if kind == "warm_up" else "Cool down"
            if _is_off_record(step):
                # Walking and drills that are not part of the watch recording. Told to Vicky in the
                # description, not made into a section, because COROS cannot time a 0 km step.
                text.append(f"Before you start: {step['effort']}." if kind == "warm_up" else f"Afterwards: {step['effort']}.")
                continue
            sections.append(_section(step, WARM_UP if kind == "warm_up" else COOL_DOWN))
            text.append(f"{label} {_words(step)}.")
        elif kind == "repeats":
            reps = int(step.get("repetitions") or 0)
            if not 1 <= reps <= MAX_REPEATS:
                raise CourseError(f"Repeats must be 1 to {MAX_REPEATS}, got {reps}")
            sets = [_section(step["work"], TRAINING)]
            line = f"Run {_words(step['work'])}" if reps == 1 else f"Repeat {reps} times: {_words(step['work'])}"
            if step.get("recovery"):
                sets.append(_section(step["recovery"], RECOVERY))
                line += f", then recover {_words(step['recovery'])}"
            sections.append({"intervalGroup": True, "repeats": reps, "sets": sets})
            text.append(line + ".")
        else:
            raise CourseError(f"Unknown step kind: {kind!r}")

    title = name or plan.get("name") or "Run"
    if len(title) > MAX_NAME:
        raise CourseError(f"Workout name is longer than {MAX_NAME} characters")
    # The plan's run notes are not sent. They can mention ankle symptoms and are for the web app only.
    description = " ".join(text)
    return {"courseName": title, "courseDescription": description, "sportType": RUNNING, "sections": sections}
