from datetime import datetime, timezone
from decimal import Decimal

import pytest

from coach.budget import DEFAULT_CAP_USD, check_cap, cost_usd, month_start


def test_cost_is_tokens_times_price_per_million():
    # Luna: 0.10 in, 0.50 out per million tokens
    assert cost_usd("openai/gpt-6-luna", 1_000_000, 0) == Decimal("0.10")
    assert cost_usd("openai/gpt-6-luna", 0, 1_000_000) == Decimal("0.50")
    assert cost_usd("openai/gpt-6-luna", 2_000, 500) == Decimal("0.00045")


def test_sol_costs_twenty_times_luna_for_the_same_call():
    assert cost_usd("openai/gpt-6-sol", 1000, 1000) == 20 * cost_usd("openai/gpt-6-luna", 1000, 1000)


def test_unknown_model_is_refused_not_guessed():
    with pytest.raises(ValueError, match="No price known"):
        cost_usd("some/new-model", 10, 10)


def test_negative_tokens_are_refused():
    with pytest.raises(ValueError):
        cost_usd("openai/gpt-6-luna", -1, 0)


def test_under_the_cap_is_allowed():
    d = check_cap(Decimal("3"), Decimal("10"))
    assert d.allowed and not d.warn and d.reason == ""


def test_at_the_cap_is_blocked_with_a_reason():
    d = check_cap(Decimal("10"), Decimal("10"))
    assert not d.allowed and "$10" in d.reason


def test_warns_from_eighty_percent_but_still_allows():
    assert not check_cap(Decimal("7.99"), Decimal("10")).warn
    d = check_cap(Decimal("8"), Decimal("10"))
    assert d.warn and d.allowed


def test_a_zero_cap_blocks_everything():
    d = check_cap(Decimal("0"), Decimal("0"))
    assert not d.allowed and not d.warn


def test_negative_numbers_are_refused():
    with pytest.raises(ValueError):
        check_cap(Decimal("-1"), Decimal("10"))


def test_default_cap_is_ten_dollars():
    assert DEFAULT_CAP_USD == Decimal("10")


def test_month_starts_at_paris_midnight_on_the_first():
    # 10 Nov 2026 12:00 UTC is in Paris winter time (UTC+1), so Paris midnight on 1 Nov is 31 Oct 23:00 UTC
    assert month_start(datetime(2026, 11, 10, 12, tzinfo=timezone.utc)) == datetime(2026, 10, 31, 23, tzinfo=timezone.utc)


def test_a_call_just_after_midnight_paris_belongs_to_the_new_month():
    # 30 Nov 23:30 UTC is 1 Dec 00:30 in Paris, so it counts in December
    assert month_start(datetime(2026, 11, 30, 23, 30, tzinfo=timezone.utc)) == datetime(2026, 11, 30, 23, tzinfo=timezone.utc)


def test_summer_time_changes_the_offset():
    assert month_start(datetime(2027, 4, 4, 8, tzinfo=timezone.utc)) == datetime(2027, 3, 31, 22, tzinfo=timezone.utc)
