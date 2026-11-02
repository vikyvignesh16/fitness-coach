import json
from pathlib import Path

import pytest

from ingest.watch_course import CourseError, parse_pace_range, to_course

PLAN = json.loads((Path(__file__).resolve().parents[2] / "data" / "paris_marathon_2027_v5_1_coros_ready.json").read_text())
NO_RUN = {"no_run", "not_recorded"}
PLANNED = [
    (day["date"], day["run"])
    for week in PLAN["weeks"][1:]
    for day in week["days"]
    if day["run"]["type"] not in NO_RUN
]
FORBIDDEN_WORDS = ("coros_workout", "intensityType", "pace_min_per_km", "distance_km", "duration_", "{", "}", "None", "null")


def run_on(date):
    return next(r for d, r in PLANNED if d == date)


class TestPace:
    def test_range_to_seconds_fastest_first(self):
        assert parse_pace_range("5:50–6:25") == (350, 385)
        assert parse_pace_range("6:25-5:50") == (350, 385)

    def test_ignores_words_after_the_times(self):
        assert parse_pace_range("4:35–4:45 provisional; adjust to race conditions") == (275, 285)

    def test_no_pace_is_none(self):
        assert parse_pace_range(None) is None
        assert parse_pace_range("") is None

    def test_a_single_time_is_refused_rather_than_guessed(self):
        with pytest.raises(CourseError):
            parse_pace_range("5:50")

    def test_out_of_range_is_refused(self):
        with pytest.raises(CourseError):
            parse_pace_range("1:00–1:30")
        with pytest.raises(CourseError):
            parse_pace_range("26:00–27:00")


class TestExamples:
    def test_simple_recovery_run(self):
        c = to_course(run_on("2026-11-02"))
        assert c["sportType"] == 1
        assert c["courseName"] == "2026-11-02 | Recovery | 5 km"
        assert c["sections"] == [
            {"sectionType": 2, "targetType": 1, "targetValue": 5000,
             "intensityType": 2, "intensityValueStart": 350, "intensityValueEnd": 385},
        ]
        assert "RPE 2–3/10" in c["courseDescription"]

    def test_strides_have_no_pace_target_and_a_repeat_group(self):
        c = to_course(run_on("2026-11-04"))
        warm, group, cool = c["sections"]
        assert warm == {"sectionType": 1, "targetType": 1, "targetValue": 2400}
        assert group["intervalGroup"] is True and group["repeats"] == 6
        assert group["sets"] == [
            {"sectionType": 2, "targetType": 2, "targetValue": 20},
            {"sectionType": 3, "targetType": 2, "targetValue": 80},
        ]
        assert cool == {"sectionType": 4, "targetType": 1, "targetValue": 3000}

    def test_open_ended_cool_down_is_free_mode(self):
        c = to_course(run_on("2027-01-06"))
        assert c["sections"][-1] == {
            "sectionType": 4, "targetType": 4, "intensityType": 2, "intensityValueStart": 345, "intensityValueEnd": 380,
        }

    def test_time_based_intervals_with_pace(self):
        group = to_course(run_on("2027-01-06"))["sections"][1]
        assert group["sets"][0] == {
            "sectionType": 2, "targetType": 2, "targetValue": 480,
            "intensityType": 2, "intensityValueStart": 270, "intensityValueEnd": 285,
        }
        assert group["sets"][1]["sectionType"] == 3 and group["sets"][1]["targetValue"] == 180

    def test_ten_k_test_has_no_recovery(self):
        group = to_course(run_on("2026-12-30"))["sections"][1]
        assert len(group["sets"]) == 1
        assert group["sets"][0]["targetType"] == 1 and group["sets"][0]["targetValue"] == 10000

    def test_half_marathon_and_race_convert(self):
        assert to_course(run_on("2027-03-07"))["sections"]
        assert to_course(run_on("2027-04-04"))["sections"]

    def test_off_record_warm_up_goes_in_the_description_not_a_section(self):
        c = to_course(run_on("2027-04-04"))
        assert all(s.get("sectionType") != 1 for s in c["sections"])
        assert "Before you start:" in c["courseDescription"]
        assert "walk" in c["courseDescription"]
        assert "Repeat 1 times" not in c["courseDescription"]

    def test_description_includes_the_plans_own_notes(self):
        assert "ankle/arch checks pass" in to_course(run_on("2026-11-02"))["courseDescription"]


class TestEveryPlannedRun:
    def test_there_are_101_planned_runs(self):
        assert len(PLANNED) == 101

    @pytest.mark.parametrize("date,run", PLANNED, ids=[d for d, _ in PLANNED])
    def test_converts_to_a_valid_course(self, date, run):
        c = to_course(run)
        assert c["sportType"] == 1
        assert 0 < len(c["courseName"]) <= 100
        assert c["courseDescription"].strip()
        for word in FORBIDDEN_WORDS:
            assert word not in c["courseDescription"], (date, word)
        assert c["sections"], "sections must not be empty"
        for s in c["sections"]:
            check_section(s, in_group=False)

    def test_every_run_has_a_unique_name(self):
        names = [to_course(r)["courseName"] for _, r in PLANNED]
        assert len(set(names)) == len(names)


def check_section(s, in_group):
    if s.get("intervalGroup"):
        assert not in_group, "groups cannot nest"
        assert 1 <= s["repeats"] <= 20
        for forbidden in ("intensityType", "targetType", "targetValue", "sectionType"):
            assert forbidden not in s
        assert s["sets"]
        for member in s["sets"]:
            assert member["sectionType"] in (2, 3)
            check_section(member, in_group=True)
        return
    assert s["sectionType"] in (1, 2, 3, 4)
    assert s["targetType"] in (1, 2, 4)
    if s["targetType"] == 4:
        assert "targetValue" not in s
    else:
        assert isinstance(s["targetValue"], int) and s["targetValue"] > 0
    if "intensityType" in s:
        assert s["intensityType"] == 2
        assert 120 <= s["intensityValueStart"] < s["intensityValueEnd"] <= 1499
    else:
        assert "intensityValueStart" not in s and "intensityValueEnd" not in s


class TestRefusals:
    def test_no_steps(self):
        with pytest.raises(CourseError):
            to_course({"coros_workout": {"steps": []}})

    def test_unknown_step_kind(self):
        with pytest.raises(CourseError):
            to_course({"coros_workout": {"steps": [{"step": "sprint"}]}})

    def test_too_many_repeats(self):
        step = {"step": "repeats", "repetitions": 21, "work": {"duration_sec": 20}}
        with pytest.raises(CourseError):
            to_course({"coros_workout": {"steps": [step]}})

    def test_a_step_with_no_length(self):
        with pytest.raises(CourseError):
            to_course({"coros_workout": {"steps": [{"step": "run", "effort": "easy"}]}})

    def test_name_over_100_characters(self):
        with pytest.raises(CourseError):
            to_course({"coros_workout": {"steps": [{"step": "run", "distance_km": 5}]}}, name="x" * 101)
