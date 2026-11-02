import json

from ingest.import_plan import PLAN_FILE, expand_plan

PLAN = json.loads(PLAN_FILE.read_text())


def test_counts_match_the_file():
    weeks, days, gates = expand_plan(PLAN)
    assert len(weeks) == 23
    assert len(days) == 161
    assert [g["gate_id"] for g in gates] == [
        "ankle_return_w2", "persistent_pain_stop", "long_run_25k_gate",
    ]


def test_calendar_starts_on_26_october_and_ends_on_race_day():
    weeks, days, _ = expand_plan(PLAN)
    assert weeks[0]["start_date"] == "2026-10-26"
    assert days[0]["date"] == "2026-10-26"
    assert days[-1]["date"] == PLAN["race_date"] == "2027-04-04"


def test_ankle_gate_is_stored_exactly_as_written():
    _, _, gates = expand_plan(PLAN)
    ankle = gates[0]["definition"]
    assert ankle == PLAN["gates"][0]
    assert "26 km" in ankle["on_fail"]  # known typo, kept on purpose


def test_days_keep_run_gym_and_nutrition_unchanged():
    _, days, _ = expand_plan(PLAN)
    original = [d for w in PLAN["weeks"] for d in w["days"]]
    for row, src in zip(days, original):
        assert row["run"] == src["run"]
        assert row["gym"] == src["gym"]
        assert row["nutrition"] == src["nutrition"]


def test_week_totals_are_copied_not_recalculated():
    weeks, _, _ = expand_plan(PLAN)
    assert [w["total_km"] for w in weeks] == [w["total_km"] for w in PLAN["weeks"]]
