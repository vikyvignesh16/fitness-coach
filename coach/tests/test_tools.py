from datetime import datetime, timezone

from coach.loop_by_hand import MAX_ROUNDS, run_loop
from coach.tools import MAX_DAYS, make_health_tool, today_paris

NOW = datetime(2026, 11, 10, 12, tzinfo=timezone.utc)  # 10 Nov in Paris


def rows(*days):
    return [{"day": d, "sleep_score": 70, "hrv_avg_ms": None} for d in days]


def tool(data=None):
    calls = []

    def fetch(first, last):
        calls.append((first, last))
        return data or []
    return make_health_tool(fetch, now=NOW), calls


def test_asks_for_the_right_date_range_counting_today():
    t, calls = tool()
    t(days=3)
    assert calls == [("2026-11-08", "2026-11-10")]


def test_returns_days_and_counts_the_ones_without_data():
    t, _ = tool(rows("2026-11-09", "2026-11-10"))
    out = t(days=7)
    assert len(out["days"]) == 2 and out["days_without_data"] == 5


def test_a_missing_number_stays_null_not_zero():
    t, _ = tool(rows("2026-11-10"))
    assert t(days=1)["days"][0]["hrv_avg_ms"] is None


def test_refuses_too_many_days_and_never_reads_the_database():
    t, calls = tool()
    assert "error" in t(days=MAX_DAYS + 1) and "error" in t(days=0) and "error" in t(days=-3)
    assert calls == []


def test_refuses_text_decimals_and_booleans():
    t, calls = tool()
    assert all("error" in t(days=bad) for bad in ["7", 3.5, True, None])
    assert calls == []


def test_the_model_sees_a_description():
    t, _ = tool()
    assert t.__name__ == "get_recent_health" and "sleep" in t.__doc__ and "1 to 14" in t.__doc__


def test_paris_date_is_used_around_midnight():
    assert today_paris(datetime(2026, 11, 10, 23, 30, tzinfo=timezone.utc)) == "2026-11-11"


# ---- the loop written by hand ----
def scripted(*steps):
    it = iter(steps)
    return lambda messages: next(it)


def test_loop_runs_the_tool_then_answers():
    model = scripted({"tool": "get_recent_health", "args": {"days": 2}}, {"answer": "You slept fine."})
    t, _ = tool(rows("2026-11-10"))
    answer, messages = run_loop(model, {"get_recent_health": t}, "How did I sleep?")
    assert answer == "You slept fine."
    assert [m["role"] for m in messages] == ["user", "model", "tool"]
    assert messages[2]["result"]["days"][0]["day"] == "2026-11-10"


def test_loop_refuses_a_tool_that_does_not_exist_and_tells_the_model():
    model = scripted({"tool": "change_my_plan", "args": {}}, {"answer": "I cannot do that."})
    _, messages = run_loop(model, {"get_recent_health": tool()[0]}, "Change my plan")
    assert "no tool called" in messages[2]["result"]["error"]


def test_loop_survives_wrong_inputs():
    model = scripted({"tool": "get_recent_health", "args": {"weeks": 2}}, {"answer": "ok"})
    _, messages = run_loop(model, {"get_recent_health": tool()[0]}, "x")
    assert "Bad inputs" in messages[2]["result"]["error"]


def test_loop_stops_after_the_round_limit():
    forever = lambda messages: {"tool": "get_recent_health", "args": {"days": 1}}
    answer, messages = run_loop(forever, {"get_recent_health": tool()[0]}, "x")
    assert answer.startswith("Stopped") and sum(m["role"] == "tool" for m in messages) == MAX_ROUNDS
