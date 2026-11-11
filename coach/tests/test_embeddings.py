from decimal import Decimal

import httpx
import pytest

from coach.budget import cost_usd
from coach.embeddings import (DIMENSIONS, MAX_TEXT_CHARS, MAX_TEXTS, MODEL, CapReached, EmbeddingError, embed,
                              openrouter_post)
from coach.tests.fakes import FakeSupabase


def vector(seed=0.1):
    return [seed] * DIMENSIONS


def answer(n=1, tokens=10, **changes):
    body = {"data": [{"index": i, "embedding": vector(i + 1)} for i in range(n)], "usage": {"prompt_tokens": tokens}}
    body.update(changes)
    return body


class FakePost:
    def __init__(self, reply):
        self.reply, self.bodies = reply, []

    def __call__(self, body):
        self.bodies.append(body)
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


def test_a_good_call_returns_vectors_in_order_and_logs_the_cost():
    sb, post = FakeSupabase(), FakePost(answer(2, tokens=500))
    out = embed(sb, "me", ["one", "two"], post=post)
    assert [v[0] for v in out.vectors] == [1, 2]
    assert out.tokens == 500 and out.cost == Decimal("0.00001")  # 500 tokens at $0.02 per million
    assert post.bodies == [{"model": MODEL, "input": ["one", "two"]}]
    row = sb.inserts[0]
    assert (row["purpose"], row["model"], row["input_tokens"], row["output_tokens"], row["ok"]) == ("embed", MODEL, 500, 0, True)


def test_the_log_never_holds_the_text():
    sb = FakeSupabase()
    embed(sb, "me", ["a private sentence about my ankle"], post=FakePost(answer(1)))
    assert "ankle" not in str(sb.inserts)


def test_answers_out_of_order_are_put_back_in_order():
    reply = answer(2)
    reply["data"].reverse()
    assert [v[0] for v in embed(FakeSupabase(), "me", ["a", "b"], post=FakePost(reply)).vectors] == [1, 2]


def test_the_cap_stops_the_call_before_it_is_made():
    sb, post = FakeSupabase(spent="10"), FakePost(answer())
    with pytest.raises(CapReached):
        embed(sb, "me", ["hello"], post=post)
    assert post.bodies == []  # nothing was sent
    assert sb.inserts[0]["ok"] is False and sb.inserts[0]["error"] == "cap_reached"


def test_the_cap_override_is_used_for_demos():
    with pytest.raises(CapReached):
        embed(FakeSupabase(spent="1"), "me", ["hello"], post=FakePost(answer()), cap_override=Decimal("0.5"))


def test_an_error_from_the_web_is_logged_and_raised():
    sb = FakeSupabase()
    with pytest.raises(EmbeddingError, match="status 500"):
        embed(sb, "me", ["hello"], post=FakePost(EmbeddingError("OpenRouter answered with status 500.")))
    assert sb.inserts[0]["ok"] is False and "500" in sb.inserts[0]["error"]


@pytest.mark.parametrize("reply", [
    {},
    {"data": [], "usage": {"prompt_tokens": 1}},
    answer(1, usage={}),
    answer(1, data=[{"index": 0, "embedding": [0.1] * 10}]),  # wrong size
    answer(1, data=[{"index": 0, "embedding": [float("nan")] * DIMENSIONS}]),
    answer(1, data=[{"index": 0, "embedding": ["x"] * DIMENSIONS}]),
    answer(1, data=[{"index": 0, "embedding": [True] * DIMENSIONS}]),
    answer(1, data=[{"index": 5, "embedding": vector()}]),  # not index 0
    answer(2),  # asked for 1, got 2
])
def test_a_wrong_answer_is_refused_and_logged_not_repaired(reply):
    sb = FakeSupabase()
    with pytest.raises(EmbeddingError):
        embed(sb, "me", ["hello"], post=FakePost(reply))
    assert sb.inserts[0]["ok"] is False


@pytest.mark.parametrize("texts", [[], [""], ["   "], [None], ["x" * (MAX_TEXT_CHARS + 1)], ["x"] * (MAX_TEXTS + 1)])
def test_bad_input_is_refused_before_any_call(texts):
    post = FakePost(answer())
    with pytest.raises(ValueError):
        embed(FakeSupabase(), "me", texts, post=post)
    assert post.bodies == []


def test_the_limits_themselves_are_allowed():
    embed(FakeSupabase(), "me", ["x" * MAX_TEXT_CHARS] * MAX_TEXTS, post=FakePost(answer(MAX_TEXTS)))


def test_the_price_is_known_and_matches_the_openrouter_list():
    assert cost_usd(MODEL, 1_000_000, 0) == Decimal("0.02")


def test_dimensions_match_the_database_column():
    sql = open("supabase/migrations/0019_library_chunks.sql").read()
    assert f"vector({DIMENSIONS})" in sql


def test_no_key_means_a_plain_error(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(EmbeddingError, match="not set"):
        openrouter_post()


def test_the_real_post_never_puts_the_key_or_the_reply_in_an_error(monkeypatch):
    def fake_post(*args, **kwargs):
        return httpx.Response(401, text="bad key sk-secret-123 and your input", request=httpx.Request("POST", "https://x"))

    monkeypatch.setattr(httpx, "post", fake_post)
    with pytest.raises(EmbeddingError) as err:
        openrouter_post("sk-secret-123")({"model": MODEL, "input": ["hello"]})
    assert "sk-secret-123" not in str(err.value) and "your input" not in str(err.value)
    assert "401" in str(err.value)


def test_the_real_post_sends_the_key_in_the_header_only(monkeypatch):
    seen = {}

    def fake_post(url, json, headers, timeout):
        seen.update(url=url, json=json, headers=headers)
        return httpx.Response(200, json={"ok": True}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", fake_post)
    assert openrouter_post("sk-abc")({"model": MODEL, "input": ["hi"]}) == {"ok": True}
    assert seen["headers"] == {"Authorization": "Bearer sk-abc"} and "sk-abc" not in str(seen["json"])
