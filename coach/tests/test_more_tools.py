from datetime import datetime, timezone

from coach.tools import MAX_RUNS, make_plan_day_tool, make_runs_tool

NOW = datetime(2026, 11, 10, 12, tzinfo=timezone.utc)


def run(day, km=10, secs=3000, **over):
    return {"started_at": f"{day}T08:00:00+00:00", "distance_km": km, "duration_s": secs, "avg_hr": 150, "training_load": 80, "perceived_effort": "Easy", **over}


def test_runs_tool_asks_for_paris_day_boundaries_in_utc():
    seen = []
    make_runs_tool(lambda a, b: seen.append((a, b)) or [], NOW)(days=3)
    assert seen == [("2026-11-07T23:00:00+00:00", "2026-11-10T23:00:00+00:00")]  # Paris midnight, winter time


def test_a_run_shows_pace_date_and_how_it_felt():
    out = make_runs_tool(lambda a, b: [run("2026-11-09", km=8.01, secs=2776)], NOW)(days=7)
    assert out["runs"] == [{"date": "2026-11-09", "distance_km": 8.0, "pace": "5:47 /km", "avg_hr": 150, "training_load": 80, "felt": "Easy"}]


def test_a_late_run_in_utc_belongs_to_the_next_paris_day():
    out = make_runs_tool(lambda a, b: [run("2026-11-09", started_at="2026-11-09T23:30:00+00:00")], NOW)(days=7)
    assert out["runs"][0]["date"] == "2026-11-10"


def test_missing_numbers_stay_null_and_notes_are_never_returned():
    out = make_runs_tool(lambda a, b: [run("2026-11-09", avg_hr=None, training_load=None, perceived_effort=None, workout_note="private")], NOW)(days=7)
    r = out["runs"][0]
    assert (r["avg_hr"], r["training_load"], r["felt"]) == (None, None, None) and "private" not in str(out)


def test_only_the_newest_twenty_runs_come_back_and_it_says_so():
    out = make_runs_tool(lambda a, b: [run(f"2026-11-{d:02d}") for d in range(1, 10)] * 3, NOW)(days=30)
    assert len(out["runs"]) == MAX_RUNS and out["runs_in_range"] == 27 and out["truncated"] is True


def test_run_day_limit_is_thirty_written_out():
    t = make_runs_tool(lambda a, b: [], NOW)
    assert "error" in t(days=31) and "error" not in t(days=30)


PLAN = {"date": "2026-11-18", "run": {"type": "quality", "distance_km": 8, "duration_min": 45, "pace_or_effort": "RPE 3 to 7", "steps": ["secret detail"], "notes": "x"},
        "gym": {"session": "Strength A", "key_exercises": [f"e{i}" for i in range(15)], "notes": "gym notes"}}


def test_plan_day_returns_the_summary_only():
    out = make_plan_day_tool(lambda d: PLAN)(day="2026-11-18")
    assert out["run"] == {"type": "quality", "distance_km": 8, "duration_min": 45, "pace_or_effort": "RPE 3 to 7"}
    assert len(out["gym"]["key_exercises"]) == 10 and "steps" not in str(out) and "notes" not in str(out)


def test_a_date_with_no_plan_says_so_instead_of_inventing_one():
    assert make_plan_day_tool(lambda d: None)(day="2027-06-01") == {"date": "2027-06-01", "in_plan": False}


def test_an_impossible_date_is_refused():
    t = make_plan_day_tool(lambda d: PLAN)
    assert "error" in t(day="2026-02-30") and "error" in t(day="18/11/2026") and "error" in t(day=20261118)


def test_the_queries_never_ask_the_database_for_notes():
    from coach.tools import HEALTH_COLUMNS, RUN_COLUMNS
    assert "note" not in RUN_COLUMNS.lower() and "note" not in HEALTH_COLUMNS.lower()


def test_one_question_can_use_two_tools_in_the_hand_written_loop():
    from coach.loop_by_hand import run_loop
    from coach.registry import Readers, build_tools
    readers = Readers(health=lambda a, b: [{"day": "2026-11-08", "sleep_asleep_min": 252}], runs=lambda a, b: [run("2026-11-08", km=18, secs=6000)], plan_day=lambda d: PLAN)
    tools = {s.name: s.fn for s in build_tools(readers, NOW)}
    steps = iter([{"tool": "get_plan_day", "args": {"day": "2026-11-08"}}, {"tool": "get_recent_runs", "args": {"days": 3}},
                  {"tool": "get_recent_health", "args": {"days": 3}}, {"answer": "done"}])
    answer, messages = run_loop(lambda m: next(steps), tools, "Was my long run harder than planned, and how did I sleep?")
    used = [m["name"] for m in messages if m["role"] == "tool"]
    assert answer == "done" and used == ["get_plan_day", "get_recent_runs", "get_recent_health"]
    assert all("error" not in m["result"] for m in messages if m["role"] == "tool")
