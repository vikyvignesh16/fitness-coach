from decimal import Decimal

import pytest

from coach.budget import (EXTRA_MODEL_CALLS, MAX_OUTPUT_TOKENS, MAX_TOOL_CALLS, MAX_TOOL_RESULT_TOKENS, check_worst_case,
                          cost_usd, worst_case_cost)
from coach.guard import ModelGuard
from coach.tests.fakes import FakeSupabase

LUNA, SOL = "openai/gpt-6-luna", "openai/gpt-6-sol"


def test_the_worst_case_is_far_above_a_normal_turn_and_still_small_for_luna():
    worst = worst_case_cost(LUNA, 6000)
    assert worst > cost_usd(LUNA, 1500, 300) * 10  # a normal turn is about 1,500 tokens in and 300 out
    assert worst < Decimal("0.05")


def test_sol_costs_twenty_times_luna_in_the_worst_case():
    assert worst_case_cost(SOL, 6000) == worst_case_cost(LUNA, 6000) * 20


def test_a_longer_prompt_has_a_higher_worst_case():
    assert worst_case_cost(LUNA, 60_000) > worst_case_cost(LUNA, 6_000)


def test_the_output_part_is_every_call_at_the_maximum_length():
    calls = MAX_TOOL_CALLS + EXTRA_MODEL_CALLS
    assert worst_case_cost(LUNA, 0) >= cost_usd(LUNA, 0, MAX_OUTPUT_TOKENS * calls)


def test_tool_results_are_counted_at_their_maximum_size_on_every_later_call():
    calls = MAX_TOOL_CALLS + EXTRA_MODEL_CALLS
    growth = sum(MAX_TOOL_RESULT_TOKENS * min(i, MAX_TOOL_CALLS) for i in range(calls))
    assert worst_case_cost(LUNA, 0) >= cost_usd(LUNA, growth, 0)


def test_an_unknown_model_or_negative_size_is_refused():
    with pytest.raises(ValueError):
        worst_case_cost("some/other-model", 100)
    with pytest.raises(ValueError):
        worst_case_cost(LUNA, -1)


def test_a_turn_may_start_only_if_the_worst_case_fits_under_the_cap():
    cap = Decimal("10")
    assert check_worst_case(Decimal("9.90"), Decimal("0.10"), cap).allowed  # exactly fills the cap
    assert not check_worst_case(Decimal("9.90"), Decimal("0.11"), cap).allowed
    assert not check_worst_case(Decimal("10"), Decimal("0.0001"), cap).allowed  # already at the cap: nothing more fits
    assert check_worst_case(Decimal("0"), Decimal("0.05"), cap).allowed


def test_negative_numbers_are_refused():
    with pytest.raises(ValueError):
        check_worst_case(Decimal("-1"), Decimal("1"), Decimal("10"))


def test_preflight_lets_a_turn_start_when_it_fits():
    sb = FakeSupabase(spent="1")
    assert ModelGuard(sb, "me", purpose="chat", model=LUNA).preflight(Decimal("0.02")) is None
    assert sb.inserts == []


def test_preflight_blocks_a_turn_that_could_pass_the_cap_and_logs_why():
    sb = FakeSupabase(spent="9.99")
    g = ModelGuard(sb, "me", purpose="chat", model=LUNA)
    reason = g.preflight(Decimal("0.02"))
    assert g.blocked and "could cost up to $0.0200" in reason and "$10" in reason
    assert sb.inserts[0]["ok"] is False and sb.inserts[0]["error"] == "cap_would_be_passed"


def test_preflight_uses_the_demo_cap_override():
    g = ModelGuard(FakeSupabase(spent="0"), "me", purpose="chat", model=LUNA, cap_override=Decimal("0.01"))
    assert g.preflight(Decimal("0.02")) is not None
