"""The design rules every tool must pass. A new tool added to the registry is checked automatically."""
import inspect
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pytest

from coach.registry import Readers, build_tools

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
SPECS = build_tools(READERS, NOW)
GOOD_ARGS = {"get_recent_health": {"days": 14}, "get_recent_runs": {"days": 30}, "get_plan_day": {"day": "2026-11-18"}}


def test_the_registry_lists_the_three_tools_and_what_each_reads():
    assert {s.name: s.reads for s in SPECS} == {
        "get_recent_health": ("health_daily",), "get_recent_runs": ("runs",), "get_plan_day": ("plan_versions", "plan_days")}


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
    for bad in [None, True, 3.5, [], {}, "banana", -1, 10**9]:
        calls.clear()
        out = spec.fn(**{param: bad})
        assert isinstance(out, dict) and "error" in out, f"{spec.name}({bad!r}) did not return an error"
        assert calls == []


@pytest.mark.parametrize("spec", SPECS, ids=lambda s: s.name)
def test_results_are_small_json_even_when_the_data_is_huge(spec):
    out = spec.fn(**GOOD_ARGS[spec.name])
    assert "error" not in out
    assert len(json.dumps(out, default=str)) <= MAX_RESULT_CHARS


@pytest.mark.parametrize("spec", SPECS, ids=lambda s: s.name)
def test_private_notes_never_leave_through_a_tool(spec):
    text = json.dumps(spec.fn(**GOOD_ARGS[spec.name]), default=str)
    assert "workout_note" not in text and "n" * 50 not in text


def test_tools_only_read():
    source = Path("coach/tools.py").read_text() + Path("coach/registry.py").read_text()
    for word in [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("]:
        assert word not in source, f"tools must be read only but found {word}"
