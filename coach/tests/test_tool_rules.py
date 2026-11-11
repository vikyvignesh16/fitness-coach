"""The design rules every tool must pass. A new tool added to the registry is checked automatically."""
import inspect
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pytest

from coach.registry import Readers, Writers, build_tools

NOW = datetime(2026, 11, 10, 12, tzinfo=timezone.utc)
MAX_RESULT_CHARS = 12_000
calls: list[str] = []


def counting(name, result):
    def fetch(*args):
        calls.append(name)
        return result
    return fetch


BIG_RUN = {"started_at": "2026-11-09T08:00:00+00:00", "distance_km": 10, "duration_s": 3000, "avg_hr": 150, "training_load": 80, "perceived_effort": "Easy"}
BIG_DAY = {"date": "2026-11-18", "run": {"type": "easy", "steps": ["x" * 500] * 20, "notes": "n" * 3000}, "gym": {"session": "A", "key_exercises": ["sq"] * 50, "notes": "n" * 3000}}
READERS = Readers(health=counting("health", [{"day": "2026-11-10"}] * 14), runs=counting("runs", [BIG_RUN] * 200), plan_day=counting("plan", BIG_DAY))
saved: list[str] = []
WRITERS = Writers(save_fact=lambda fact: saved.append(fact))
SPECS = build_tools(READERS, WRITERS, NOW)
# The only tools allowed to change data, and the only tables they may change. Adding a write tool means a human edits this line.
APPROVED_WRITES = {"save_memory": ("coach_memory",)}
GOOD_ARGS = {"get_recent_health": {"days": 14}, "get_recent_runs": {"days": 30}, "get_plan_day": {"day": "2026-11-18"}, "save_memory": {"fact": "Likes mornings"}}
DEFAULT_BAD = [None, True, 3.5, [], {}, "banana", -1, 10**9]  # "banana" is not a valid number or date
BAD_INPUT = {"save_memory": [None, True, 3.5, [], {}]}  # for a text tool, "banana" is fine, so only wrong types count here


def test_the_registry_lists_the_tools_and_what_each_reads():
    assert {s.name: s.reads for s in SPECS} == {
        "get_recent_health": ("health_daily",), "get_recent_runs": ("runs",), "get_plan_day": ("plan_versions", "plan_days"),
        "save_memory": ("coach_memory",)}


def test_only_approved_tools_may_write_and_only_to_approved_tables():
    assert {s.name: s.writes for s in SPECS if s.writes} == APPROVED_WRITES


def test_every_other_tool_declares_that_it_writes_nothing():
    assert all(s.writes == () for s in SPECS if s.name not in APPROVED_WRITES)


@pytest.mark.parametrize("spec", SPECS, ids=lambda s: s.name)
def test_name_matches_and_every_input_is_typed_and_described(spec):
    sig = inspect.signature(spec.fn)
    assert spec.fn.__name__ == spec.name
    assert sig.return_annotation is dict
    doc = spec.fn.__doc__
    assert doc and "Args:" in doc and "Returns:" in doc
    for param in sig.parameters.values():
        assert param.annotation is not inspect.Parameter.empty, f"{param.name} has no type hint"
        assert re.search(rf"\b{param.name}:", doc.split("Args:")[1]), f"{param.name} is not described in the docstring"


@pytest.mark.parametrize("spec", SPECS, ids=lambda s: s.name)
def test_bad_input_returns_an_error_message_and_never_reads_data(spec):
    param = next(iter(inspect.signature(spec.fn).parameters))
    for bad in BAD_INPUT.get(spec.name, DEFAULT_BAD):
        calls.clear()
        saved.clear()
        out = spec.fn(**{param: bad})
        assert isinstance(out, dict) and "error" in out, f"{spec.name}({bad!r}) did not return an error"
        assert calls == [] and saved == []


@pytest.mark.parametrize("spec", SPECS, ids=lambda s: s.name)
def test_results_are_small_json_even_when_the_data_is_huge(spec):
    out = spec.fn(**GOOD_ARGS[spec.name])
    assert "error" not in out
    assert len(json.dumps(out, default=str)) <= MAX_RESULT_CHARS


@pytest.mark.parametrize("spec", SPECS, ids=lambda s: s.name)
def test_private_notes_never_leave_through_a_tool(spec):
    text = json.dumps(spec.fn(**GOOD_ARGS[spec.name]), default=str)
    assert "workout_note" not in text and "n" * 50 not in text


def test_no_tool_file_talks_to_the_database_to_write():
    """The read tools only read. The save tool writes only by calling the function it is given (add_fact)."""
    for name in ["coach/tools.py", "coach/registry.py", "coach/memory_tools.py"]:
        source = Path(name).read_text()
        for word in [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("]:
            assert word not in source, f"{name} must not write directly but found {word}"
