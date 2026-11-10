import json

import pytest

from ingest.strength_parse import parse_strength_detail, parse_strength_records, parse_strength_sets

# The shapes COROS really sent on 2026-11-10, with invented numbers.
RECORDS = """Sport Records — 2026-09-11 to 2026-11-10 (4 records)
========================

1. Strength — 2026-11-07
   Location: Shoulders and Core Version 1
   Time Window: startTimestamp=1794050966 | endTimestamp=1794056140
   Duration: 1:09:19 | Sets: 41
 | Avg HR: 110 bpm | Calories: 482 kcal
   LabelId: 481587878676169304 | SportType: 402

2. Outdoor Run — 2026-11-06
   Location: London Run
   Time Window: startTimestamp=1793960000 | endTimestamp=1793963000
   Duration: 50:00 | Distance: 10.00 km
   LabelId: 481500000000000001 | SportType: 100

3. Strength — 2026-11-04
   Time Window: startTimestamp=1793800000 | endTimestamp=1793803000
   Duration: 45:22 | Sets: 8
   LabelId: 481500000000000002 | SportType: 402

4. Strength — 2026-11-04
   Location: Legs Version 1
   Time Window: startTimestamp=1793830000 | endTimestamp=1793833000
   Duration: 30:00
   LabelId: 481500000000000003 | SportType: 402
"""

DETAIL = """🏋️ Strength Activity Details
========================================

Workout Time: 1:09:19
Total Time: 1:26:13
Sets: 41
Average Heart Rate: 110 bpm
Calories: 482 kcal
Training Load: 30
Aerobic TE: 1.8
Anaerobic TE: 0.0
Training Focus: Recovery
Perceived Effort: Easy
Workout Note: Shoulders felt good.
Second line."""


def lap(i, name, reps, weight, time=40.0, hr=100):
    return {"lapIndex": i, "exerciseNameKey": name, "sets": 0, "reps": reps, "time": time, "totalLength": 0, "weight": weight,
            "avgHr": hr, "maxHr": hr + 10, "calories": 0, "bodyTemperature": 0}


def sets_json(laps):
    columns = ["lapIndex", "exerciseNameKey", "sets", "reps", "time", "totalLength", "weight", "avgHr", "maxHr", "calories", "bodyTemperature"]
    return json.dumps({"source": "activityDetail", "labelId": "1", "sportType": 402, "columns": [{"name": c} for c in columns],
                       "lapGroups": [{"type": 2, "laps": laps}], "sportDataDetails": []})


# Press: 12 x 16 kg, 12 x 16 kg, 12 x 18 kg, then the summary row (48 reps, 12*16+12*16+12*18 = 600 kg... see below).
PRESS = [lap(3, "Press", 12, 16000), lap(4, "Press", 0, 16000, 45), lap(5, "Press", 12, 16000), lap(6, "Press", 0, 16000, 45),
         lap(7, "Press", 12, 18000), lap(8, "Press", 36, 12 * 16000 + 12 * 16000 + 12 * 18000)]
LAPS = [lap(1, "Warm Up", 59, 0), lap(2, "Warm Up", 59, 0), *PRESS, lap(9, "Rest", 12, 0), lap(10, "Cool Down", 100, 0)]


def test_strength_sessions_are_read_from_the_list_and_runs_are_skipped():
    sessions = parse_strength_records(RECORDS)
    assert [s["coros_id"] for s in sessions] == ["481587878676169304", "481500000000000002", "481500000000000003"]
    first = sessions[0]
    assert first["workout_name"] == "Shoulders and Core Version 1" and first["duration_s"] == 4159
    assert (first["sets_count"], first["avg_hr"], first["calories"]) == (41, 110, 482)
    assert first["day"] == "2026-11-07" and first["started_at"].startswith("2026-11-07")


def test_a_session_with_no_name_or_heart_rate_leaves_them_empty():
    second = parse_strength_records(RECORDS)[1]
    assert second["workout_name"] is None and second["avg_hr"] is None and second["calories"] is None
    assert second["sets_count"] == 8
    assert parse_strength_records(RECORDS)[2]["sets_count"] is None


def test_the_day_is_the_paris_day():
    late = RECORDS.replace("startTimestamp=1794050966", "startTimestamp=1793919600")  # 2026-11-05 23:00 UTC = 00:00 on 6 Nov in Paris
    assert parse_strength_records(late)[0]["day"] == "2026-11-06"


def test_the_json_string_form_is_decoded():
    assert parse_strength_records(json.dumps(RECORDS)) == parse_strength_records(RECORDS)


def test_a_count_mismatch_or_a_missing_field_raises():
    with pytest.raises(ValueError, match="said 5"):
        parse_strength_records(RECORDS.replace("(4 records)", "(5 records)"))
    with pytest.raises(ValueError, match="missing a field"):
        parse_strength_records(RECORDS.replace("Duration: 1:09:19 | Sets: 41", "Sets: 41"))
    with pytest.raises(ValueError, match="no record count"):
        parse_strength_records("something else")


def test_the_detail_has_times_sets_load_effort_and_your_note():
    d = parse_strength_detail(DETAIL)
    assert (d["duration_s"], d["total_time_s"], d["sets_count"]) == (4159, 5173, 41)
    assert (d["training_load"], d["aerobic_te"], d["anaerobic_te"]) == (30, 1.8, 0.0)
    assert (d["training_focus"], d["perceived_effort"]) == ("Recovery", "Easy")
    assert d["workout_note"] == "Shoulders felt good.\nSecond line."


def test_a_detail_with_few_fields_leaves_the_rest_empty_and_a_wrong_text_raises():
    d = parse_strength_detail("🏋️ Strength Activity Details\n====\n\nWorkout Time: 30:00\n")
    assert d["duration_s"] == 1800 and d["training_load"] is None and d["sets_count"] is None and d["workout_note"] is None
    with pytest.raises(ValueError, match="not an activity detail"):
        parse_strength_detail("Sleep Overview")


def test_sets_drop_the_summary_row_and_the_rest_rows_and_convert_grams_to_kg():
    sets = parse_strength_sets(sets_json(LAPS))
    assert [(s["exercise"], s["reps"], s["weight_kg"]) for s in sets] == [("Press", 12, 16.0), ("Press", 12, 16.0), ("Press", 12, 18.0)]


def test_warm_up_cool_down_and_rest_rows_are_not_exercises():
    names = {s["exercise"] for s in parse_strength_sets(sets_json(LAPS))}
    assert names == {"Press"}


def test_positions_count_up_across_the_whole_session():
    laps = [*PRESS, lap(20, "Curl", 10, 10000), lap(21, "Curl", 10, 10000), lap(22, "Curl", 20, 200000)]
    assert [s["position"] for s in parse_strength_sets(sets_json(laps))] == [1, 2, 3, 4, 5]


def test_a_summary_that_does_not_add_up_is_not_dropped():
    # Four real sets of 12, and the last one is not a total, so all four stay.
    laps = [lap(i, "Row", 12, 20000) for i in range(1, 5)]
    assert len(parse_strength_sets(sets_json(laps))) == 4


def test_a_single_set_with_its_summary_is_one_set():
    laps = [lap(1, "Raise", 10, 8000), lap(2, "Raise", 10, 80000)]
    assert [(s["reps"], s["weight_kg"]) for s in parse_strength_sets(sets_json(laps))] == [(10, 8.0)]


def test_no_weight_means_body_weight_and_is_left_empty_not_zero():
    laps = [lap(1, "Crunch", 15, 0), lap(2, "Crunch", 15, 0), lap(3, "Crunch", 30, 0)]
    assert [s["weight_kg"] for s in parse_strength_sets(sets_json(laps))] == [None, None]


def test_the_same_exercise_in_two_separate_blocks_stays_separate():
    laps = [lap(1, "Curl", 10, 10000), lap(2, "Curl", 10, 100000), lap(3, "Rest", 0, 0), lap(4, "Curl", 8, 12000), lap(5, "Curl", 8, 96000)]
    assert [(s["reps"], s["weight_kg"]) for s in parse_strength_sets(sets_json(laps))] == [(10, 10.0), (8, 12.0)]


def test_set_heart_rate_and_time_are_kept_when_present():
    s = parse_strength_sets(sets_json([lap(1, "Raise", 10, 8000, time=33.5, hr=95), lap(2, "Raise", 10, 80000)]))[0]
    assert (s["seconds"], s["avg_hr"], s["max_hr"]) == (33.5, 95, 105)


def test_a_timed_hold_with_no_reps_gives_no_sets_rather_than_a_guess():
    assert parse_strength_sets(sets_json([lap(1, "Wall Sit", 0, 0), lap(2, "Wall Sit", 0, 0)])) == []


def test_unexpected_set_data_raises():
    with pytest.raises(ValueError, match="no set by set data"):
        parse_strength_sets(json.dumps({"columns": [], "lapGroups": []}))
    with pytest.raises(ValueError, match="'weight' column"):
        parse_strength_sets(json.dumps({"columns": [{"name": "exerciseNameKey"}, {"name": "reps"}], "lapGroups": [{"laps": []}]}))


def test_a_last_row_with_the_right_reps_but_the_wrong_weight_total_is_a_real_set():
    laps = [lap(1, "Curl", 10, 10000), lap(2, "Curl", 10, 10000), lap(3, "Curl", 20, 999000)]
    assert len(parse_strength_sets(sets_json(laps))) == 3


def test_a_last_row_with_the_right_weight_total_but_the_wrong_reps_is_a_real_set():
    laps = [lap(1, "Curl", 10, 10000), lap(2, "Curl", 10, 10000), lap(3, "Curl", 5, 200000)]
    assert len(parse_strength_sets(sets_json(laps))) == 3
