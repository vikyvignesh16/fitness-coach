from decimal import Decimal
from types import SimpleNamespace

from coach.guard import ModelGuard
from coach.llm_log import cap_for, month_spend, record_call
from coach.tests.fakes import FakeSupabase

LUNA = "openai/gpt-6-luna"


def guard(sb, **kw):
    return ModelGuard(sb, "me", purpose="first_call", model=LUNA, **kw)


def usage(tokens_in, tokens_out, error=None):
    return SimpleNamespace(usage_metadata=SimpleNamespace(prompt_token_count=tokens_in, candidates_token_count=tokens_out), error_code=error)


def test_missing_cap_row_means_ten_dollars():
    assert cap_for(FakeSupabase(), "me") == Decimal("10")
    assert cap_for(FakeSupabase(cap="25.00"), "me") == Decimal("25.00")


def test_month_spend_adds_the_rows():
    assert month_spend(FakeSupabase(spent="1.250000"), "me") == Decimal("1.25")
    assert month_spend(FakeSupabase(), "me") == Decimal("0")


def test_call_goes_ahead_under_the_cap():
    sb = FakeSupabase(spent="1")
    g = guard(sb)
    assert g.before_model(None, None) is None and not g.blocked
    assert sb.inserts == []


def test_call_is_blocked_at_the_cap_and_the_block_is_logged():
    sb = FakeSupabase(spent="10")
    g = guard(sb)
    reply = g.before_model(None, None)
    assert g.blocked
    assert "cap" in reply.content.parts[0].text.lower()
    assert sb.inserts[0]["ok"] is False and sb.inserts[0]["error"] == "cap_reached" and sb.inserts[0]["cost_usd"] == "0"


def test_cap_override_is_used_instead_of_the_saved_cap():
    sb = FakeSupabase(cap="10", spent="0.05")
    assert guard(sb, cap_override=Decimal("0.01")).before_model(None, None) is not None
    assert guard(sb, cap_override=Decimal("1")).before_model(None, None) is None


def test_after_the_call_the_cost_is_worked_out_and_logged():
    sb = FakeSupabase()
    g = guard(sb)
    g.after_model(None, usage(2_000, 500))
    row = sb.inserts[0]
    assert (row["input_tokens"], row["output_tokens"], row["cost_usd"], row["ok"]) == (2000, 500, "0.00045", True)
    assert g.last_cost == Decimal("0.00045")


def test_an_error_reply_is_logged_as_not_ok():
    sb = FakeSupabase()
    guard(sb).after_model(None, usage(10, 0, error="500"))
    assert sb.inserts[0]["ok"] is False and sb.inserts[0]["error"] == "500"


def test_a_reply_with_no_usage_logs_nothing():
    sb = FakeSupabase()
    guard(sb).after_model(None, SimpleNamespace(usage_metadata=None, error_code=None))
    assert sb.inserts == []


def test_long_error_text_is_cut_to_fit_the_column():
    sb = FakeSupabase()
    record_call(sb, "me", purpose="x", model=LUNA, input_tokens=1, output_tokens=1, cost=Decimal("0"), ok=False, error="e" * 300)
    assert len(sb.inserts[0]["error"]) == 80
