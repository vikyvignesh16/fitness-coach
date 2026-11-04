import json
from datetime import date, timedelta

import pytest

from coach.safety import plan_rules as r
from coach.tests.helpers import START, day, easy_week, levels, plan, week

V51 = json.load(open("data/paris_marathon_2027_v5_1_coros_ready.json"))


def km_plan(*totals, phases=None):
    """Weeks with one run of the given total, so only the ramp matters."""
    phases = phases or ["Base"] * len(totals)
    ws = []
    for i, (t, ph) in enumerate(zip(totals, phases), start=2):
        s = START + timedelta(days=7 * i)
        ws.append(week(i, [day(0, "easy", t, week_start=s), day(6, "no_run", week_start=s)], ph))
    return plan(*ws)


# ---- ramp
def test_ramp_exactly_ten_percent_is_fine():
    assert r.check_ramp(km_plan(33.55, 36.905), first_week_baseline_km=33.55) == []


def test_ramp_just_above_ten_is_a_warning():
    assert levels(r.check_ramp(km_plan(50, 55.1), 50), "ramp") == ["warning"]


def test_ramp_exactly_fifteen_is_a_warning_and_above_is_a_fail():
    assert levels(r.check_ramp(km_plan(40, 46), 40), "ramp") == ["warning"]
    assert levels(r.check_ramp(km_plan(40, 46.1), 40), "ramp") == ["fail"]


def test_falling_mileage_is_never_a_violation():
    assert r.check_ramp(km_plan(30, 10), 40) == []


def test_a_dip_does_not_lower_the_baseline():
    # 57, recovery 48, then 57: compared with 57, not 48
    assert r.check_ramp(km_plan(57, 48, 57, phases=["Base", "Recovery", "Base"]), 57) == []


# Rule changed 2026-11-04 (Vicky's decision): the baseline is the highest of the previous four weeks.
def test_returning_to_recent_volume_after_a_race_dip_is_fine():
    # the December 2026 case: 50, taper 19, race week 36.1, recovery 37, back to 52
    plan_ = km_plan(50, 19, 36.1, 37, 52, phases=["Base", "Base", "Recovery", "10K test", "Build"])
    assert levels(r.check_ramp(plan_, 50), "ramp") == []


def test_a_genuine_spike_still_fails():
    assert levels(r.check_ramp(km_plan(40, 40, 40, 60), 40), "ramp") == ["fail"]


def test_overshooting_after_a_dip_still_fails():
    # 50, dip to 20, then 60: 60 is 20 percent over the recent peak of 50
    assert levels(r.check_ramp(km_plan(50, 20, 60), 50), "ramp") == ["fail"]


def test_a_peak_exactly_four_weeks_back_still_counts():
    assert r.check_ramp(km_plan(50, 30, 30, 30, 50), 50) == []


def test_a_peak_five_weeks_back_is_forgotten():
    assert levels(r.check_ramp(km_plan(50, 30, 30, 30, 30, 50), 50), "ramp") == ["fail"]


def test_first_week_uses_the_given_baseline_not_week_one():
    assert levels(r.check_ramp(km_plan(32), r.FIRST_WEEK_BASELINE_KM), "ramp") == []
    assert round(r.FIRST_WEEK_BASELINE_KM, 2) == 33.55


def test_race_week_is_exempt_from_ramp():
    ws = START + timedelta(days=7)
    race = week(2, [day(0, "easy", 4, week_start=ws), day(6, "marathon_race", 42.195, week_start=ws)])
    assert r.check_ramp(plan(race), 10) == []


def test_week_one_actual_is_not_checked():
    actual = week(1, [day(0, "actual", 80)], phase="Actual")
    assert r.check_plan(plan(actual)) == []


# ---- long run
def test_run_above_32_km_fails_but_race_day_is_exempt():
    ws = START
    big = week(2, [day(0, "long_run", 32.1, week_start=ws), day(1, "easy", 20, week_start=ws)])
    assert "long_run_cap" in [v.rule for v in r.check_long_run(plan(big))]
    ok = week(2, [day(0, "long_run", 32, week_start=ws), day(1, "easy", 20, week_start=ws)])
    assert "long_run_cap" not in [v.rule for v in r.check_long_run(plan(ok))]
    race = week(2, [day(0, "easy", 5, week_start=ws), day(6, "marathon_race", 42.195, week_start=ws)])
    assert r.check_long_run(plan(race)) == []


def test_long_run_share_boundaries():
    def share_plan(long_km, other_km):
        """One long run plus other runs, each shorter than it, adding up to other_km."""
        others = [day(i, "easy", other_km / 5) for i in range(1, 6)]
        return plan(week(2, [day(0, "long_run", long_km)] + others))
    assert levels(r.check_long_run(share_plan(45, 55)), "long_run_share") == []         # exactly 45
    assert levels(r.check_long_run(share_plan(45.5, 54.5)), "long_run_share") == ["warning"]
    assert levels(r.check_long_run(share_plan(50, 50)), "long_run_share") == ["warning"]  # exactly 50
    assert levels(r.check_long_run(share_plan(50.5, 49.5)), "long_run_share") == ["fail"]


def test_half_marathon_week_is_exempt_from_share():
    p = plan(week(2, [day(0, "half_marathon_test", 21.1), day(2, "easy", 5)]))
    assert levels(r.check_long_run(p), "long_run_share") == []


# ---- rest days
def test_two_days_with_no_running_is_the_minimum():
    p = plan(week(2, [day(i, "easy", 5) for i in range(5)] + [day(5), day(6)]))
    assert levels(r.check_rest_days(p), "rest_running") == []
    p = plan(week(2, [day(i, "easy", 5) for i in range(6)] + [day(6)]))
    assert levels(r.check_rest_days(p), "rest_running") == ["fail"]


def test_a_full_rest_day_needs_no_running_and_no_heavy_lifting():
    # 2 days off running, but both have heavy lifting
    days = [day(i, "easy", 5) for i in range(5)] + [day(5, session="Back + biceps", sets=20),
                                                     day(6, session="Legs + ankle/calf", sets=28)]
    assert levels(r.check_rest_days(plan(week(2, days))), "rest_full") == ["fail"]
    # Saturday mobility counts as light
    days[5] = day(5, session="Mobility + prehab", sets=14)
    assert levels(r.check_rest_days(plan(week(2, days))), "rest_full") == []


# ---- quality
def test_one_quality_run_is_fine_two_fail():
    assert r.check_quality(plan(week(2, [day(2, "quality", 8)]))) == []
    p = plan(week(2, [day(2, "quality", 8), day(4, "quality", 8)]))
    assert levels(r.check_quality(p), "quality_max") == ["fail"]


def test_test_week_allows_the_test_plus_one_quality_run():
    p = plan(week(2, [day(2, "quality", 8), day(6, "half_marathon_test", 21.1)]))
    assert r.check_quality(p) == []
    p = plan(week(2, [day(1, "quality", 8), day(2, "quality", 8), day(6, "10k_test", 12)]))
    assert levels(r.check_quality(p), "quality_max") == ["fail"]


# ---- heavy legs
LEGS = "Legs + ankle/calf"


def test_legs_72_hours_before_a_long_run():
    ok = plan(week(2, [day(3, session=LEGS, sets=28), day(6, "long_run", 20)]))  # Thu to Sun: 72 hours
    assert r.check_heavy_legs(ok) == []
    bad = plan(week(2, [day(4, session=LEGS, sets=28), day(6, "long_run", 20)]))  # Fri to Sun: 48 hours
    assert levels(r.check_heavy_legs(bad), "legs_gap") == ["fail"]
    same = plan(week(2, [day(6, "long_run", 20, LEGS, 28)]))
    assert levels(r.check_heavy_legs(same), "legs_gap") == ["fail"]


def test_legs_before_a_test_or_race_follow_the_same_72_hours():
    for kind in ("10k_test", "half_marathon_test", "marathon_race"):
        bad = plan(week(2, [day(5, session=LEGS, sets=28), day(6, kind, 10)]))
        assert "fail" in levels(r.check_heavy_legs(bad), "legs_gap"), kind


def test_no_heavy_legs_the_day_before_a_quality_run():
    bad = plan(week(2, [day(1, session=LEGS, sets=28), day(2, "quality", 8)]))
    assert levels(r.check_heavy_legs(bad), "legs_gap") == ["fail"]
    ok = plan(week(2, [day(3, session=LEGS, sets=28), day(2, "quality", 8)]))  # legs after quality
    assert r.check_heavy_legs(ok) == []


def test_light_leg_session_is_not_heavy():
    p = plan(week(2, [day(5, session=LEGS, sets=10), day(6, "long_run", 20)]))
    assert r.check_heavy_legs(p) == []
    p = plan(week(2, [day(5, session=LEGS, sets=11), day(6, "long_run", 20)]))
    assert levels(r.check_heavy_legs(p), "legs_gap") == ["fail"]


def legs_on(d):
    ws = d - timedelta(days=d.weekday())
    return plan(week(20, [day((d - ws).days, session=LEGS, sets=28, week_start=ws)]))


def test_last_heavy_legs_date_depends_on_recovery():
    mar11, feb25, mar12 = date(2027, 3, 11), date(2027, 2, 25), date(2027, 3, 12)
    assert r.check_heavy_legs(legs_on(mar11), True) == []
    assert levels(r.check_heavy_legs(legs_on(mar11), False), "legs_dates") == ["fail"]
    assert levels(r.check_heavy_legs(legs_on(mar11), None), "legs_dates") == ["warning"]
    assert r.check_heavy_legs(legs_on(feb25), False) == []
    assert r.check_heavy_legs(legs_on(feb25), None) == []
    assert levels(r.check_heavy_legs(legs_on(mar12), True), "legs_dates") == ["fail"]
    assert levels(r.check_heavy_legs(legs_on(mar12), None), "legs_dates") == ["fail"]


def test_no_heavy_legs_in_race_week():
    race_week_thursday = date(2027, 4, 1)
    assert levels(r.check_heavy_legs(legs_on(race_week_thursday), True), "legs_dates") == ["fail"]


# ---- whole plan, v5.1
def test_v51_has_no_fails():
    assert [v for v in r.check_plan(V51) if v.level == "fail"] == []


def test_v51_warnings_are_exactly_the_known_ones():
    got = sorted((v.rule, v.week) for v in r.check_plan(V51))
    assert got == sorted([
        ("ramp", 3), ("ramp", 4), ("ramp", 7), ("ramp", 15),  # week 11 stopped warning under the 2026-11-04 rule
        ("long_run_share", 6), ("long_run_share", 8),
        ("legs_dates", 20),
    ])


def test_v51_with_recovery_not_confirmed_fails_on_week_20():
    fails = [(v.rule, v.week) for v in r.check_plan(V51, recovered_from_half_marathon=False) if v.level == "fail"]
    assert fails == [("legs_dates", 20)]


def test_v51_after_confirmed_recovery_drops_the_legs_warning():
    got = [v.rule for v in r.check_plan(V51, recovered_from_half_marathon=True)]
    assert "legs_dates" not in got


def test_declared_week_totals_match_the_days():
    for w in V51["weeks"][1:]:
        assert r._week_km(w) == pytest.approx(w["total_km"], abs=0.01), w["week"]


def test_check_plan_lists_fails_first():
    bad = km_plan(10, 40)
    levels_in_order = [v.level for v in r.check_plan(bad)]
    assert levels_in_order == sorted(levels_in_order, key=lambda lv: lv != "fail")
