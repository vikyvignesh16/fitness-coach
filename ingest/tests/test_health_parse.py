import json

import pytest

from ingest.health_parse import (
    clock_seconds, merge_days, minutes, parse_avg_hr, parse_daily_health, parse_fitness, parse_recovery,
    parse_resting_hr, parse_sleep_hrv, parse_sleep_overview, parse_stress, parse_training_load, recovery_rollup,
)

# These are the shapes COROS really sent on 2026-11-09, with invented numbers.
SLEEP = """Sleep Overview
========================
Note: each record below is dated by its wake-up day.

2026-10-26
Sleep Score: 0
Sleep detail for this day is not available yet.

2026-10-03
Sleep Score: -1
Daily Sleep: 27min (incl. naps)
Main Sleep (asleep): 27min
Main Sleep Period (incl. awake): 30min
Awake Time: 3 min

2026-11-04
Sleep Score: 80
Daily Sleep: 8h 10min (incl. naps)
Main Sleep (asleep): 7h 40min
Main Sleep Period (incl. awake): 8h 30min
Sleep metrics scope: daily
Deep Sleep Ratio: 19%
Light Sleep Ratio: 48%
REM Ratio: 27%
Awake Ratio: 6%
Awake Time: 50 min
Awake Count (>5 min): 1
Main Sleep Window: 2026-11-03 23:20 - 2026-11-04 07:50
Naps Total (asleep): 30 min
Naps Period (incl. awake): 31 min
Nap Window: 2026-11-04 14:49 - 2026-11-04 15:18
"""

HRV = """Sleep HRV — 2026-11-03 to 2026-11-09
========================
Note: dates are wake-up days (each value comes from the night that ended that morning).

HRV Assessment — Last 7 days
========================

2026-11-08:
  HRV Avg: 44 ms — Low
  Normal Range: 54 - 68 ms
  Baseline: 61 ms
2026-11-03:
  No data

Sleep HRV Time Series — Last 7 days
========================

2026-11-08:
  timestamp=1793747390, timezone=4, hrv=84 ms, status=4, confidence=90909
2026-11-03: no official sleep HRV value for this day; raw HRV points omitted.
"""

DAILY = """Daily Health Data — Last 14 days | Resting HR: 54 bpm | HRV Baseline: 42 ms
Note: sleep entries are dated by their wake-up day.

--- 20261027 ---
Steps: 0 | Calories: 0 kcal | Exercise: 0 min

--- 20261104 ---
Steps: 12,765 | Calories: 1,336 kcal | Exercise: 1h 58min
Stress: Avg 34
Sleep Summary:
  Total: 8h 37min | Deep: 1h 39min | Light: 4h 11min | REM: 2h 18min | Awake: 29 min
  Sleep HR: Avg 55 bpm | Min 47 bpm | Max 96 bpm
"""

RESTING = """Resting Heart Rate — Last 14 days
========================

2026-11-09: No data
2026-11-08: 55 bpm
"""

AVG_HR = """Average Heart Rate — Last 15 days
========================

2026-11-09: 69 bpm (Min: 49, Max: 96)
2026-11-08: 81 bpm (Min: 46, Max: 165)
"""

STRESS = """Stress Level — Last 14 days
========================

2026-11-09:
Average Stress: 32
Relaxed: No data
Low: No data

2026-11-08:
Average Stress: No data
Relaxed: No data
"""

LOAD = """Training Load Assessment
========================

2026-11-09
Comment: Maintaining
Short-Term Load: 62
Long-Term Load: 64
Load Ratio: 0.96

2026-11-08
Comment: Optimized
Short-Term Load: 72
Long-Term Load: 65
Load Ratio: 1.10
"""

RECOVERY = "Recovery Status\n========================\n\nRecovery: 96%\nLevel: Fresh\nEstimated Full Recovery: 15h"

FITNESS = """Fitness Assessment Overview
========================

VO2max: 50
Running Level: 90
Threshold Pace: 3:57 /km
5 km Prediction: 18:52
10 km Prediction: 38:58
Half Marathon Prediction: 1:26:36
Marathon Prediction: 3:06:31"""


def test_durations_and_clock_times():
    assert minutes("8h 8min") == 488 and minutes("29 min") == 29 and minutes("27min") == 27 and minutes("1h") == 60
    assert clock_seconds("3:57 /km") == 237 and clock_seconds("18:52") == 1132 and clock_seconds("1:26:36") == 5196
    with pytest.raises(ValueError):
        minutes("soon")


def test_the_json_string_form_is_decoded():
    assert parse_resting_hr(json.dumps(RESTING)) == parse_resting_hr(RESTING)


def test_sleep_a_missing_night_is_left_out_not_scored_zero():
    days = parse_sleep_overview(SLEEP)
    assert "2026-10-26" not in days


def test_sleep_a_negative_score_is_dropped_but_the_sleep_times_stay():
    row = parse_sleep_overview(SLEEP)["2026-10-03"]
    assert "sleep_score" not in row
    assert row["sleep_asleep_min"] == 27


def test_sleep_a_normal_night():
    row = parse_sleep_overview(SLEEP)["2026-11-04"]
    assert row["sleep_score"] == 80
    assert (row["sleep_total_min"], row["sleep_asleep_min"], row["sleep_period_min"]) == (490, 460, 510)
    assert (row["sleep_awake_min"], row["sleep_nap_min"]) == (50, 30)
    assert row["sleep_start"] == "2026-11-03T23:20:00+01:00" and row["sleep_end"] == "2026-11-04T07:50:00+01:00"


def test_sleep_score_without_any_times_raises():
    with pytest.raises(ValueError, match="no sleep times"):
        parse_sleep_overview("Sleep Overview\n\n2026-11-04\nSleep Score: 80\n")


def test_hrv_keeps_the_label_range_and_baseline_and_skips_no_data():
    days = parse_sleep_hrv(HRV)
    assert days == {"2026-11-08": {
        "hrv_avg_ms": 44, "hrv_label": "Low", "hrv_normal_low_ms": 54, "hrv_normal_high_ms": 68, "hrv_baseline_ms": 61,
    }}


def test_hrv_raw_points_are_not_read():
    assert "2026-11-03" not in parse_sleep_hrv(HRV)


def test_daily_health_sleep_stages_are_minutes():
    row = parse_daily_health(DAILY)["2026-11-04"]
    assert (row["sleep_deep_min"], row["sleep_light_min"], row["sleep_rem_min"], row["sleep_awake_min"]) == (99, 251, 138, 29)
    assert (row["sleep_hr_avg"], row["sleep_hr_min"], row["sleep_hr_max"]) == (55, 47, 96)
    assert (row["steps"], row["calories_kcal"], row["exercise_min"], row["stress_avg"]) == (12765, 1336, 118, 34)


def test_daily_health_a_day_of_zeros_is_a_day_the_watch_recorded_nothing():
    assert "2026-10-27" not in parse_daily_health(DAILY)


def test_resting_and_average_heart_rate():
    assert parse_resting_hr(RESTING) == {"2026-11-08": {"resting_hr": 55}}
    assert parse_avg_hr(AVG_HR)["2026-11-08"] == {"hr_avg": 81, "hr_min": 46, "hr_max": 165}
    assert "2026-11-09" in parse_avg_hr(AVG_HR)


def test_an_unexpected_heart_rate_line_raises():
    with pytest.raises(ValueError):
        parse_resting_hr(RESTING.replace("55 bpm", "fifty five"))


def test_stress_average_only_and_no_data_is_left_out():
    assert parse_stress(STRESS) == {"2026-11-09": {"stress_avg": 32}}


def test_training_load_uses_coros_numbers():
    assert parse_training_load(LOAD)["2026-11-08"] == {
        "load_short": 72, "load_long": 65, "load_ratio": 1.10, "load_label": "Optimized",
    }


def test_training_load_missing_number_raises():
    with pytest.raises(ValueError, match="missing a number"):
        parse_training_load(LOAD.replace("Load Ratio: 0.96", ""))


def test_recovery_status():
    assert parse_recovery(RECOVERY) == {"recovery_pct": 96, "level": "Fresh", "full_recovery_h": 15}
    assert parse_recovery(RECOVERY.replace("15h", "1d 3h"))["full_recovery_h"] == 27
    with pytest.raises(ValueError):
        parse_recovery("Recovery Status\n\nLevel: Fresh")


def test_fitness_overview_times_are_seconds():
    assert parse_fitness(FITNESS) == {
        "vo2max": 50.0, "running_level": 90.0, "threshold_pace_s": 237,
        "pred_5k_s": 1132, "pred_10k_s": 2338, "pred_half_s": 5196, "pred_marathon_s": 11191,
    }


def test_wrong_tool_text_is_refused():
    with pytest.raises(ValueError, match="expected 'Stress Level'"):
        parse_stress(RESTING)


def test_merge_combines_by_day_and_never_blanks_a_value():
    merged = merge_days({"d": {"a": 1, "b": 2}}, {"d": {"a": None, "c": 3}}, {"e": {"x": 1}})
    assert merged == {"d": {"a": 1, "b": 2, "c": 3}, "e": {"x": 1}}


def test_recovery_rollup():
    assert recovery_rollup([96, 80, 90]) == {"recovery_avg": 88.7, "recovery_min": 80, "recovery_max": 96, "recovery_last": 90}
    assert recovery_rollup([]) == {}
