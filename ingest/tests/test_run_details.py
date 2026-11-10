import json

import pytest

from ingest.run_details import EDITABLE, parse_activity_detail

# The shape COROS really sent on 2026-11-09, with invented numbers.
FULL = """🏃 Outdoor Run Activity Details
========================================

Workout Time: 1:24:53
Distance: 14.00 km
Total Time: 1:24:58
Average Pace: 6:04 /km
Moving Average Pace: 5:58 /km
Adjusted Pace: 5:58 /km
Best Kilometer: 5:35 /km
Average Heart Rate: 160 bpm
Average Cadence: 157 spm
Average Stride Length: 1.05 m
Average Power: 226 W
Elevation Gain / Loss: 1,104 m / 109 m
Calories: 1352 kcal
Training Load: 242
Aerobic TE: 4.0
Anaerobic TE: 0.1
Training Focus: Base
Performance: Below Average
Perceived Effort: Very Easy
Workout Note: Long run day. It felt fine.
A second line: legs a bit heavy at the end."""


def test_reads_every_field():
    assert parse_activity_detail(FULL) == {
        "training_load": 242, "aerobic_te": 4.0, "anaerobic_te": 0.1, "training_focus": "Base",
        "performance": "Below Average", "perceived_effort": "Very Easy",
        "workout_note": "Long run day. It felt fine.\nA second line: legs a bit heavy at the end.",
        "cadence_spm": 157, "stride_length_m": 1.05, "power_w": 226, "elevation_m": 1104, "elev_loss_m": 109, "best_km_pace_s": 335,
    }


def test_the_json_string_form_is_decoded():
    assert parse_activity_detail(json.dumps(FULL)) == parse_activity_detail(FULL)


def test_a_treadmill_run_with_few_fields_leaves_the_rest_empty():
    short = "🏃 Indoor Run Activity Details\n========\n\nWorkout Time: 43:24\nDistance: 8.20 km\nTraining Load: 80\n"
    row = parse_activity_detail(short)
    assert row["training_load"] == 80
    assert row["elevation_m"] is None and row["perceived_effort"] is None and row["workout_note"] is None
    assert row["best_km_pace_s"] is None and row["cadence_spm"] is None


def test_placeholders_mean_nothing_not_a_value():
    text = FULL.replace("Perceived Effort: Very Easy", "Perceived Effort: --").replace("Training Load: 242", "Training Load: N/A")
    row = parse_activity_detail(text)
    assert row["perceived_effort"] is None and row["training_load"] is None


def test_an_empty_note_is_no_note():
    text = FULL[: FULL.index("Workout Note:")] + "Workout Note: "
    assert parse_activity_detail(text)["workout_note"] is None


def test_a_note_that_looks_like_a_field_is_still_just_the_note():
    text = FULL[: FULL.index("Workout Note:")] + "Workout Note: Training Load: 999 and Perceived Effort: Hard"
    row = parse_activity_detail(text)
    assert row["workout_note"] == "Training Load: 999 and Perceived Effort: Hard"
    assert row["training_load"] == 242 and row["perceived_effort"] == "Very Easy"


def test_something_that_is_not_an_activity_raises():
    with pytest.raises(ValueError, match="not an activity detail"):
        parse_activity_detail("Sleep Overview\n\nSleep Score: 80")


def test_a_value_in_an_unexpected_shape_raises_instead_of_guessing():
    with pytest.raises(ValueError, match="Training Load"):
        parse_activity_detail(FULL.replace("Training Load: 242", "Training Load: very high"))
    with pytest.raises(ValueError, match="elevation"):
        parse_activity_detail(FULL.replace("1,104 m / 109 m", "up and down"))
    with pytest.raises(ValueError, match="pace"):
        parse_activity_detail(FULL.replace("5:35 /km", "fast"))


def test_the_fields_you_can_edit_in_coros_are_named():
    assert set(EDITABLE) == {"perceived_effort", "workout_note"}


def test_the_note_label_only_counts_at_the_start_of_a_line():
    text = FULL.replace("Performance: Below Average", "Performance: see Workout Note: below")
    assert parse_activity_detail(text)["workout_note"].startswith("Long run day.")
    assert parse_activity_detail(text)["performance"] == "see Workout Note: below"
