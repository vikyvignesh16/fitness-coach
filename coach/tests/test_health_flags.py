import re
from pathlib import Path

from coach.health_flags import HIGH_LOAD, LIMITS, LOW_HRV, LOW_RECOVERY, SHORT_SLEEP, day_flags, summarise
from coach.tools import make_health_tool
from datetime import datetime, timezone

TS = Path("web/lib/insights-flags.ts").read_text()


def test_python_limits_match_the_typescript_ones_the_insights_card_uses():
    block = TS[TS.index("FLAG_LIMITS = {"):TS.index("} as const")]
    ts_limits = {k: float(v) for k, v in re.findall(r"(\w+):\s*([\d.]+)", block)}
    assert ts_limits == {k: float(v) for k, v in LIMITS.items()}


def test_six_hours_exactly_is_not_short_but_359_is():
    assert day_flags({"sleep_asleep_min": 360}) == [] and day_flags({"sleep_asleep_min": 359}) == [SHORT_SLEEP]


def test_5_nov_example_is_flagged_as_a_short_night_with_normal_hrv():
    flags = day_flags({"sleep_asleep_min": 345, "sleep_score": 54, "hrv_avg_ms": 57, "hrv_normal_low_ms": 55})
    assert flags == [SHORT_SLEEP]


def test_hrv_below_range_needs_both_numbers():
    assert day_flags({"hrv_avg_ms": 48, "hrv_normal_low_ms": 55}) == [LOW_HRV]
    assert day_flags({"hrv_avg_ms": 48, "hrv_normal_low_ms": None}) == []
    assert day_flags({"hrv_avg_ms": 55, "hrv_normal_low_ms": 55}) == []


def test_load_ratio_must_be_above_1_3_and_can_arrive_as_text():
    assert day_flags({"load_ratio": "1.31"}) == [HIGH_LOAD] and day_flags({"load_ratio": "1.30"}) == []


def test_recovery_under_50_only():
    assert day_flags({"recovery_last": 49}) == [LOW_RECOVERY] and day_flags({"recovery_last": 50}) == []


def test_missing_numbers_give_no_flags_never_a_false_alarm():
    assert day_flags({"sleep_asleep_min": None, "hrv_avg_ms": None, "load_ratio": None, "recovery_last": None}) == []
    assert day_flags({}) == []


def test_summary_counts_and_knows_how_many_nights_had_data():
    rows = [{"sleep_asleep_min": 345}, {"sleep_asleep_min": 252, "hrv_avg_ms": 44, "hrv_normal_low_ms": 54}, {"sleep_asleep_min": 480}, {}]
    assert summarise(rows) == {"nights_under_6h": 2, "nights_hrv_below_range": 1, "nights_with_sleep_data": 3}


def test_the_tool_attaches_flags_and_a_summary():
    now = datetime(2026, 11, 10, 12, tzinfo=timezone.utc)
    t = make_health_tool(lambda a, b: [{"day": "2026-11-05", "sleep_asleep_min": 345}], now=now)
    out = t(days=7)
    assert out["days"][0]["flags"] == [SHORT_SLEEP] and out["summary"]["nights_under_6h"] == 1
