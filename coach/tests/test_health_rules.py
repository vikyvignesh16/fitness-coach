import json

import pytest

from coach.safety.health_rules import (ANKLE_CHECKS, PainReport, check_pain, evaluate_ankle_gate,
                                       locked_weeks)

V51 = json.load(open("data/paris_marathon_2027_v5_1_coros_ready.json"))


def test_no_pain_no_violation():
    assert check_pain(PainReport()) == []
    assert check_pain(PainReport(score=2, repeated=True, lasted_hours=48)) == []


def test_pain_three_or_more_repeatedly_stops_the_plan():
    v = check_pain(PainReport(score=3, repeated=True))
    assert [x.rule for x in v] == ["pain_stop"] and v[0].level == "fail"
    assert "sports physio or clinician" in v[0].message


def test_pain_three_once_and_short_does_not_stop():
    assert check_pain(PainReport(score=3, repeated=False, lasted_hours=10)) == []


def test_pain_lasting_over_24_hours_stops():
    assert check_pain(PainReport(score=3, lasted_hours=24)) == []
    assert len(check_pain(PainReport(score=3, lasted_hours=24.5))) == 1


def test_worse_next_morning_stops_whatever_the_score():
    assert len(check_pain(PainReport(score=1, worse_next_morning=True))) == 1


@pytest.mark.parametrize("flag", ["swelling", "giving_way", "gait_change", "cannot_bear_weight"])
def test_each_serious_flag_stops_even_with_no_pain_score(flag):
    v = check_pain(PainReport(score=0, flags={flag}))
    assert len(v) == 1 and "physio or clinician" in v[0].message


def test_cannot_bear_weight_asks_for_prompt_medical_assessment():
    assert "prompt medical assessment" in check_pain(PainReport(flags={"cannot_bear_weight"}))[0].message
    assert "prompt medical" not in check_pain(PainReport(flags={"swelling"}))[0].message


def test_unknown_flag_is_an_error_not_ignored():
    with pytest.raises(ValueError):
        check_pain(PainReport(flags={"sore_toe"}))


def test_ankle_gate_needs_all_four_checks_to_pass():
    assert evaluate_ankle_gate({c: True for c in ANKLE_CHECKS}).passed
    one_fail = {c: True for c in ANKLE_CHECKS} | {"balance_30s": False}
    result = evaluate_ankle_gate(one_fail)
    assert not result.passed and result.failed_checks == ["balance_30s"]


def test_ankle_gate_refuses_a_missing_answer():
    with pytest.raises(ValueError):
        evaluate_ankle_gate({"no_swelling_or_limp": True})


def test_ankle_checks_match_the_four_checks_in_the_plan_gate():
    assert len(V51["gates"][0]["checks"]) == len(ANKLE_CHECKS) == 4


def test_week_two_is_locked_until_the_gate_passes():
    assert locked_weeks(False) == {2}
    assert locked_weeks(True) == set()
