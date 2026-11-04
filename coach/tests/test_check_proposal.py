import copy
import json
from datetime import date

from coach.check_proposal import (BASE_PLAN, check_against_base, check_notes, check_runs,
                                  check_totals, report)

STEP = {"step": "run", "distance_km": 8, "pace_min_per_km": "5:35–6:15", "effort": "RPE 3–4/10"}


def plan_with(run: dict, d: str = "2027-01-05") -> dict:
    return {"weeks": [{"week": 1, "total_km": run.get("distance_km", 0),
                       "days": [{"date": d, "run": run}]}]}


def good_run() -> dict:
    return {"type": "easy", "distance_km": 8, "duration_min": 48, "pace_or_effort": "Easy",
            "steps": [copy.deepcopy(STEP)],
            "coros_workout": {"name": "2027-01-05 | Easy | 8 km", "total_distance_km": 8,
                              "rpe_range_0_10": [3, 4], "steps": [copy.deepcopy(STEP)]}}


def test_good_run_is_clean():
    assert check_runs(plan_with(good_run())) == ([], [])


def test_step_without_pace_is_an_error():
    r = good_run()
    del r["steps"][0]["pace_min_per_km"]
    errors, _ = check_runs(plan_with(r))
    assert any("has no pace range" in e for e in errors)


def test_repeat_work_without_pace_is_an_error():
    r = good_run()
    r["steps"] = [{"step": "repeats", "repetitions": 3, "work": {"duration_min": 5}, "recovery": None}]
    r["coros_workout"]["steps"] = r["steps"]
    errors, _ = check_runs(plan_with(r))
    assert any("work has no pace range" in e for e in errors)


def test_single_pace_value_is_rejected():
    r = good_run()
    r["steps"][0]["pace_min_per_km"] = "5:40"
    errors, _ = check_runs(plan_with(r))
    assert any("Expected a pace range" in e for e in errors)


def test_run_without_coros_workout_is_an_error():
    r = good_run()
    r["coros_workout"] = None
    errors, _ = check_runs(plan_with(r))
    assert any("no coros_workout" in e for e in errors)


def test_watch_steps_must_match_run_steps():
    r = good_run()
    r["coros_workout"]["steps"][0]["pace_min_per_km"] = "5:00–5:30"
    errors, _ = check_runs(plan_with(r))
    assert any("differs from the run's steps" in e for e in errors)


def test_step_sum_mismatch_is_a_warning_not_an_error():
    r = good_run()
    r["steps"][0]["distance_km"] = 6
    r["coros_workout"]["steps"] = r["steps"]
    errors, warnings = check_runs(plan_with(r))
    assert errors == [] and any("add up to 6.0 km" in w for w in warnings)


def test_off_record_warm_up_needs_no_pace():
    r = good_run()
    r["steps"].insert(0, {"step": "warm_up", "distance_km": 0, "effort": "5 min walk"})
    r["coros_workout"]["steps"] = r["steps"]
    assert check_runs(plan_with(r)) == ([], [])


def test_stale_hard_effort_on_easy_run_is_flagged():
    r = good_run()
    r["coros_workout"]["rpe_range_0_10"] = [7, 9]
    _, warnings = check_runs(plan_with(r))
    assert any("hard effort range" in w for w in warnings)


def test_stale_easy_effort_on_race_is_flagged():
    r = good_run()
    r["type"] = "half_marathon_test"
    _, warnings = check_runs(plan_with(r))
    assert any("easy effort range" in w for w in warnings)


def test_marathon_pace_headline_without_mp_step_is_flagged():
    r = good_run()
    r["pace_or_effort"] = "21 km easy + 7 km provisional MP"
    _, warnings = check_runs(plan_with(r))
    assert any("no step is run at marathon pace" in w for w in warnings)
    r["steps"].append({"step": "run", "distance_km": 2, "pace_min_per_km": "4:37–4:44"})
    r["coros_workout"]["steps"] = r["steps"]
    r["distance_km"] = r["coros_workout"]["total_distance_km"] = 10
    _, warnings = check_runs(plan_with(r))
    assert not any("marathon pace" in w for w in warnings)


def test_notes_must_be_complete():
    day = {"date": "2027-01-05", "coaching_notes": {"before": "x", "during": "x", "after": "x",
                                                    "next_24_48h": "x", "stop_or_modify": "x"}}
    plan = {"weeks": [{"week": 1, "days": [day, {"date": "2027-01-06"}]}]}
    out = check_notes(plan)
    assert any("missing heart_rate" in o for o in out) and any("no coaching_notes" in o for o in out)


def test_week_total_mismatch():
    plan = plan_with(good_run())
    plan["weeks"][0]["total_km"] = 20
    assert check_totals(plan)


def base_and_copy():
    base = json.loads(BASE_PLAN.read_text())
    plan = copy.deepcopy(base)
    plan["plan_version"] = "9.9"
    return base, plan


def test_unchanged_copy_with_new_version_passes():
    base, plan = base_and_copy()
    assert check_against_base(plan, base, date(2026, 11, 4)) == ([], [])


def test_same_version_number_is_an_error():
    base, plan = base_and_copy()
    plan["plan_version"] = base["plan_version"]
    errors, _ = check_against_base(plan, base, date(2026, 11, 4))
    assert any("plan_version" in e for e in errors)


def test_editing_a_past_day_is_an_error_but_extra_detail_is_not():
    base, plan = base_and_copy()
    past = plan["weeks"][0]["days"][2]  # 2026-10-28, the recorded run
    past["run"]["fueling_hydration"] = {"new": "detail"}  # allowed
    assert check_against_base(plan, base, date(2026, 11, 4)) == ([], [])
    past["run"]["distance_km"] = 99
    errors, _ = check_against_base(plan, base, date(2026, 11, 4))
    assert any("2026-10-28" in e and "run changed" in e for e in errors)


def test_future_days_may_change():
    base, plan = base_and_copy()
    plan["weeks"][5]["days"][2]["run"]["distance_km"] = 99
    assert check_against_base(plan, base, date(2026, 11, 4)) == ([], [])


def test_missing_day_is_an_error():
    base, plan = base_and_copy()
    plan["weeks"][5]["days"].pop()
    errors, _ = check_against_base(plan, base, date(2026, 11, 4))
    assert any("missing" in e for e in errors)


def test_report_has_paste_block_only_when_there_is_something_to_say():
    assert "paste this" not in report({"errors": [], "warnings": []}, "x.json")
    out = report({"errors": ["a"], "warnings": ["b"]}, "x.json")
    assert "TO FIX: a" in out and "TO LOOK AT: b" in out and "fixes needed" in out


def test_saying_the_10k_test_was_replaced_is_not_flagged():
    r = good_run()
    r["notes"] = "Replaces 10K test; the half marathon is the benchmark."
    assert check_runs(plan_with(r)) == ([], [])
    r["notes"] = "Recalibrate after 10K test."
    _, warnings = check_runs(plan_with(r))
    assert any("10K test" in w for w in warnings)


# ---- saving a draft ----

class FakeTable:
    def __init__(self, db, name):
        self.db, self.name, self.filters, self.row = db, name, {}, None

    def select(self, _cols):
        return self

    def eq(self, k, v):
        self.filters[k] = v
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, _n):
        return self

    def insert(self, row):
        self.row = row
        return self

    def execute(self):
        class R: pass
        r = R()
        if self.row is not None:
            self.db.inserted.append((self.name, self.row))
            r.data = [{"id": "draft-1"}]
        else:
            r.data = [x for x in self.db.rows.get(self.name, []) if all(x.get(k) == v for k, v in self.filters.items() if k != "user_id")]
        return r


class FakeSb:
    def __init__(self, rows=None):
        self.rows, self.inserted = rows or {}, []

    def table(self, name):
        return FakeTable(self, name)


OK = {"errors": [], "warnings": ["w"]}


def test_save_stores_a_draft_with_the_checks_and_base():
    from coach.check_proposal import save_draft
    sb = FakeSb({"plan_versions": [{"id": "v51", "version": "5.1"}]})
    assert save_draft(sb, "me", {"plan_version": "9.9"}, OK, " why ") == "draft-1"
    table, row = sb.inserted[0]
    assert table == "plan_proposals" and row["reason"] == "why"
    assert row["checks"] == {"errors": [], "warnings": ["w"]} and row["base_version_id"] == "v51"


def test_save_refuses_a_plan_with_errors_or_no_reason_or_a_used_version():
    import pytest
    from coach.check_proposal import SaveRefused, save_draft
    sb = FakeSb({"plan_versions": [{"id": "v51", "version": "5.1"}]})
    with pytest.raises(SaveRefused, match="problems"):
        save_draft(sb, "me", {"plan_version": "9.9"}, {"errors": ["x"], "warnings": []}, "why")
    with pytest.raises(SaveRefused, match="reason"):
        save_draft(sb, "me", {"plan_version": "9.9"}, OK, "  ")
    with pytest.raises(SaveRefused, match="already exists"):
        save_draft(sb, "me", {"plan_version": "5.1"}, OK, "why")
    draft = FakeSb({"plan_proposals": [{"id": "p", "version": "9.9"}]})
    with pytest.raises(SaveRefused, match="already exists"):
        save_draft(draft, "me", {"plan_version": "9.9"}, OK, "why")
    assert sb.inserted == [] and draft.inserted == []


def test_long_watch_descriptions_are_reported_not_cut():
    from coach.check_proposal import check_descriptions
    r = good_run()
    r["notes"] = "x" * 450
    out = check_descriptions(plan_with(r))
    assert out and "longer than 400" in out[0]
    assert r["notes"] == "x" * 450
    assert check_descriptions(plan_with(good_run())) == []
