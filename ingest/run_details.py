"""Turn the text of COROS's getActivityDetail into columns for the runs table.

Every field is optional, because a treadmill run or an old run has fewer of them. A value of "--" or "N/A" means
COROS has nothing. An answer that is not an activity detail at all raises, so a format change stops the job loudly.
Format checked on 2026-11-09 with one outdoor run (coros-mcp skill).
"""
import json
import re

MISSING = {"", "--", "-", "N/A", "n/a"}


def _unwrap(text: str) -> str:
    return json.loads(text) if text.lstrip().startswith('"') else text


def _pace_seconds(clock: str) -> int:
    m = re.fullmatch(r"\s*(\d+):(\d{2})(?:\s*/km)?\s*", clock)
    if not m:
        raise ValueError(f"Unexpected COROS pace: {clock!r}")
    return int(m.group(1)) * 60 + int(m.group(2))


def _field(text: str, label: str) -> str | None:
    m = re.search(rf"^{re.escape(label)}: ?(.*)$", text, re.M)
    if not m:
        return None
    value = m.group(1).strip()
    return None if value in MISSING else value


def _number(text: str, label: str, unit: str | None = None, cast=float):
    value = _field(text, label)
    if value is None:
        return None
    m = re.fullmatch(rf"(-?[\d,.]+)\s*{re.escape(unit)}?" if unit else r"(-?[\d,.]+)", value)
    if not m:
        raise ValueError(f"Unexpected COROS value for {label}: {value!r}")
    return cast(m.group(1).replace(",", ""))


def parse_activity_detail(text: str) -> dict:
    """Return the detail columns COROS gave. Missing fields come back as None, so the caller can tell them apart."""
    text = _unwrap(text)
    if "Activity Details" not in text[:200]:
        raise ValueError("Unexpected COROS response: this is not an activity detail.")

    gain = loss = None
    elevation = _field(text, "Elevation Gain / Loss")
    if elevation:
        m = re.fullmatch(r"(\d[\d,]*)\s*m\s*/\s*(\d[\d,]*)\s*m", elevation)
        if not m:
            raise ValueError(f"Unexpected COROS elevation: {elevation!r}")
        gain, loss = int(m.group(1).replace(",", "")), int(m.group(2).replace(",", ""))

    best = _field(text, "Best Kilometer")
    # The note is the last line and may hold anything, so it is taken whole from after its label.
    note = re.search(r"^Workout Note: ?(.*)\Z", text, re.M | re.S)
    note_text = note.group(1).strip() if note else ""

    return {
        "training_load": _number(text, "Training Load", cast=int),
        "aerobic_te": _number(text, "Aerobic TE"),
        "anaerobic_te": _number(text, "Anaerobic TE"),
        "training_focus": _field(text, "Training Focus"),
        "performance": _field(text, "Performance"),
        "perceived_effort": _field(text, "Perceived Effort"),
        "workout_note": note_text if note_text not in MISSING else None,
        "cadence_spm": _number(text, "Average Cadence", "spm", int),
        "stride_length_m": _number(text, "Average Stride Length", "m"),
        "power_w": _number(text, "Average Power", "W", int),
        "elevation_m": gain,
        "elev_loss_m": loss,
        "best_km_pace_s": _pace_seconds(best) if best else None,
    }


# Fields the user can edit in COROS after the run. When COROS says they are gone, they are cleared here too.
EDITABLE = ("perceived_effort", "workout_note")
