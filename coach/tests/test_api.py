"""The coach service, run in memory with a scripted model and fake databases. Nothing here touches the network."""
import asyncio
import logging
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient

from coach.api import MAX_TEXT, Deps, create_app
from coach.answer_checks import NO_SOURCE_MESSAGE
from coach.tests.fake_llm import ScriptedLlm, call, say
from coach.tests.fakes import FakeStore

TOKENS = {"token-vicky": "user-1", "token-other": "user-2"}
SECRET_TEXT = "my private words about my ankle"
THREAD_B = "22222222-2222-4222-8222-222222222222"


class TrackingStore(FakeStore):
    """The service client. Remembers which tables it was asked about."""

    def __init__(self):
        super().__init__()
        self.touched: list[str] = []

    @staticmethod
    def make_id(n: int) -> str:
        return str(uuid.UUID(int=n))  # real ids are UUIDs, and the service checks that shape

    def table(self, name):
        self.touched.append(name)
        return super().table(name)


class UserDb:
    """A stand in for the signed in user's client. It only returns that user's rows (like Row Level Security) and refuses all writes."""

    def __init__(self, store: FakeStore, owner: str):
        self.store, self.owner, self.touched = store, owner, []

    def table(self, name):
        self.touched.append(name)
        outer = self

        class ReadOnly:
            def __init__(self):
                self.query = FakeStore.table(outer.store, name).eq("user_id", outer.owner)  # not the tracked call: this is not the master key

            def __getattr__(self, attr):
                if attr in ("insert", "update", "upsert", "delete"):
                    raise AssertionError(f"the user client must not write ({attr} on {name})")
                return getattr(self.query, attr)

            def select(self, *a):
                self.query = self.query.select(*a)
                return self

            def eq(self, *a):
                self.query = self.query.eq(*a)
                return self

            def gte(self, *a):
                self.query = self.query.gte(*a)
                return self

            def lte(self, *a):
                self.query = self.query.lte(*a)
                return self

            def order(self, *a, **k):
                self.query = self.query.order(*a, **k)
                return self

            def execute(self):
                return self.query.execute()

        return ReadOnly()


class SlowLlm(ScriptedLlm):
    delay: float = 0.3

    async def generate_content_async(self, llm_request, stream=False):
        await asyncio.sleep(self.delay)
        async for response in super().generate_content_async(llm_request, stream):
            yield response


class BoomLlm(ScriptedLlm):
    async def generate_content_async(self, llm_request, stream=False):
        raise RuntimeError(f"upstream failure that repeats: {SECRET_TEXT}")
        yield  # pragma: no cover


def make(script=(), llm=None, **overrides):
    store = TrackingStore()
    model = llm or ScriptedLlm(script=list(script))
    seen = {"verified": [], "user_dbs": []}

    def verify(token):
        seen["verified"].append(token)
        return TOKENS.get(token)

    def user_client(token):
        db = UserDb(store, TOKENS[token])
        seen["user_dbs"].append(db)
        return db

    deps = Deps(verify_token=verify, user_client=user_client, service_client=store, make_llm=lambda: model, **overrides)
    return TestClient(create_app(deps)), store, model, seen


def post(client, body, token="token-vicky", **kw):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.post("/chat", json=body, headers=headers, **kw)


def messages(store, owner="user-1"):
    return [(m["role"], m["body"]) for m in store.tables.get("chat_messages", []) if m["user_id"] == owner]


# ------------------------------------------------------------ the front door
def test_the_health_check_needs_no_login_and_shows_no_data():
    client, *_ = make()
    assert client.get("/healthz").json() == {"ok": True}


def test_no_automatic_documentation_pages_exist():
    client, *_ = make()
    assert all(client.get(path).status_code == 404 for path in ("/docs", "/redoc", "/openapi.json"))


@pytest.mark.parametrize("headers", [{}, {"Authorization": ""}, {"Authorization": "Bearer"}, {"Authorization": "Basic token-vicky"},
                                     {"Authorization": "Bearer nonsense"}, {"Authorization": "token-vicky"},
                                     {"Authorization": "Bearer " + "x" * 5000}])
def test_a_missing_or_wrong_wristband_is_refused_and_nothing_runs(headers):
    client, store, llm, _ = make(["unused"])
    reply = client.post("/chat", json={"text": "hello"}, headers=headers)
    assert reply.status_code == 401 and llm.seen == [] and "chat_threads" not in store.tables


def test_the_login_is_checked_before_the_body_is_read():
    client, *_ = make()
    assert client.post("/chat", content=b"not json at all").status_code == 401
    assert client.post("/chat", json={"user_id": "user-2", "text": ""}).status_code == 401  # no 422 for strangers


def test_a_token_check_that_crashes_is_treated_as_a_bad_token():
    def verify(token):
        raise RuntimeError("supabase unreachable")

    deps = Deps(verify_token=verify, user_client=lambda t: None, service_client=TrackingStore(), make_llm=lambda: None)
    assert post(TestClient(create_app(deps)), {"text": "hi"}).status_code == 401


def test_the_exact_token_is_passed_to_the_check():
    client, _, _, seen = make([say("hi")])
    post(client, {"text": "hello"})
    assert seen["verified"] == ["token-vicky"]


# ------------------------------------------------------------ the user id comes only from the wristband
def test_a_user_id_in_the_message_is_refused():
    client, store, llm, _ = make(["unused"])
    reply = post(client, {"text": "hello", "user_id": "user-2"})
    assert reply.status_code == 422 and "user_id" in reply.json()["error"] and llm.seen == []


def test_messages_are_saved_under_the_id_the_token_proves():
    client, store, *_ = make([say("Hi Vicky."), say("Hi there.")])
    post(client, {"text": "hello"}, token="token-vicky")
    post(client, {"text": "hello"}, token="token-other")
    assert messages(store, "user-1") == [("user", "hello"), ("coach", "Hi Vicky.")]
    assert messages(store, "user-2") == [("user", "hello"), ("coach", "Hi there.")]
    assert {t["user_id"] for t in store.tables["chat_threads"]} == {"user-1", "user-2"}


# ------------------------------------------------------------ bad input
@pytest.mark.parametrize("body", [{}, {"text": ""}, {"text": "   "}, {"text": "x" * (MAX_TEXT + 1)}, {"text": 5}, {"text": None},
                                  {"text": "hi", "thread_id": "not-an-id"}, {"text": "hi", "thread_id": 7}, {"text": "hi", "extra": 1},
                                  [], "hello"])
def test_bad_input_is_refused_before_the_coach_runs(body):
    client, store, llm, _ = make(["unused"])
    assert post(client, body).status_code == 422
    assert llm.seen == [] and "chat_threads" not in store.tables


def test_validation_errors_never_repeat_the_text_back():
    client, *_ = make()
    reply = post(client, {"text": SECRET_TEXT + "x" * MAX_TEXT})
    assert reply.status_code == 422 and SECRET_TEXT not in reply.text


def test_the_text_limit_itself_is_allowed():
    client, *_ = make([say("ok")])
    assert post(client, {"text": "x" * MAX_TEXT}).status_code == 200


def test_a_huge_body_is_refused():
    client, *_ = make()
    assert post(client, {"text": "hi", "pad": "x" * 20_000}).status_code == 413


# ------------------------------------------------------------ a turn
def test_a_new_conversation_returns_a_thread_id_and_saves_both_sides():
    client, store, *_ = make([say("Hello Vicky.")])
    reply = post(client, {"text": "Hi coach"})
    body = reply.json()
    assert reply.status_code == 200 and body["reply"] == "Hello Vicky." and body["thread_id"]
    assert (body["revised"], body["replaced"], body["blocked"], body["stopped"]) == (False, False, False, False)
    assert messages(store) == [("user", "Hi coach"), ("coach", "Hello Vicky.")]
    assert store.tables["chat_threads"][0]["title"] == "Hi coach"


def test_a_second_message_continues_the_same_conversation():
    client, store, llm, _ = make([say("First."), say("Second.")])
    thread = post(client, {"text": "one"}).json()["thread_id"]
    again = post(client, {"text": "two", "thread_id": thread}).json()
    assert again["thread_id"] == thread and len(store.tables["chat_threads"]) == 1
    assert [t for _, t in llm.contents_text(1)] == ["one", "First.", "two"]


def test_someone_elses_conversation_is_not_found_and_nothing_is_written_to_it():
    client, store, llm, _ = make([say("Hi."), say("unused")])
    other = post(client, {"text": "private"}, token="token-other").json()["thread_id"]
    reply = post(client, {"text": "let me in", "thread_id": other}, token="token-vicky")
    assert reply.status_code == 404 and messages(store, "user-1") == []
    assert len(llm.seen) == 1  # only the other user's own turn ever reached the model


def test_a_conversation_id_that_does_not_exist_is_not_found():
    client, _, llm, _ = make(["unused"])
    assert post(client, {"text": "hi", "thread_id": THREAD_B}).status_code == 404 and llm.seen == []


def test_tools_read_through_the_user_client_and_never_through_the_master_key():
    client, store, llm, seen = make([call("get_recent_health", days=1), say("No watch data came back.")])
    store.table("health_daily").insert({"user_id": "user-1", "day": "2026-11-12", "sleep_asleep_min": 470}).execute()
    store.touched.clear()
    post(client, {"text": "How did I sleep?"})
    assert "health_daily" in seen["user_dbs"][0].touched and "health_daily" not in store.touched


def test_the_user_client_is_never_used_to_write():
    client, *_ = make([say("ok")])
    assert post(client, {"text": "hello"}).status_code == 200  # the UserDb raises if anything writes through it


def test_guardrail_results_come_back_to_the_app():
    bad = say("Aim for 1.4 g of protein per kg.")
    client, *_ = make([bad, bad])
    body = post(client, {"text": "How much protein should I eat?"}).json()
    assert body["revised"] and body["replaced"] and body["reply"] == NO_SOURCE_MESSAGE


def test_a_turn_stopped_by_the_cap_returns_blocked_and_leaves_no_empty_conversation():
    client, store, llm, _ = make(["unused"])
    store.table("llm_calls").insert({"user_id": "user-1", "cost_usd": "10"}).execute()
    body = post(client, {"text": "hi"}).json()
    assert body["blocked"] and body["thread_id"] is None and llm.seen == []
    assert store.tables.get("chat_threads", []) == []


# ------------------------------------------------------------ brakes
def test_the_kill_switch_turns_everything_off_before_anything_else_happens():
    client, store, llm, seen = make(["unused"], enabled=lambda: False)
    reply = post(client, {"text": "hi"})
    assert reply.status_code == 503 and seen["verified"] == [] and llm.seen == []


def test_the_kill_switch_reads_the_environment(monkeypatch):
    monkeypatch.setenv("COACH_ENABLED", "false")
    client, *_ = make(["unused"])
    assert post(client, {"text": "hi"}).status_code == 503
    monkeypatch.setenv("COACH_ENABLED", "true")
    client2, *_ = make([say("ok")])
    assert post(client2, {"text": "hi"}).status_code == 200


def test_the_rate_limit_stops_a_user_after_the_hourly_allowance_and_frees_up_later():
    clock = {"now": 1000.0}
    client, *_ = make([say("a"), say("b"), say("c")], turns_per_hour=2, clock=lambda: clock["now"])
    assert post(client, {"text": "1"}).status_code == 200 and post(client, {"text": "2"}).status_code == 200
    assert post(client, {"text": "3"}).status_code == 429
    clock["now"] += 3601
    assert post(client, {"text": "4"}).status_code == 200


def test_the_rate_limit_is_per_user():
    client, *_ = make([say("a"), say("b")], turns_per_hour=1)
    assert post(client, {"text": "1"}, token="token-vicky").status_code == 200
    assert post(client, {"text": "1"}, token="token-other").status_code == 200


def test_a_second_message_while_one_is_running_is_turned_away():
    llm = SlowLlm(script=[say("slow answer"), say("never")])

    async def two_at_once():
        store = TrackingStore()
        deps = Deps(verify_token=TOKENS.get, user_client=lambda t: UserDb(store, TOKENS[t]), service_client=store, make_llm=lambda: llm)
        transport = httpx.ASGITransport(app=create_app(deps))
        async with httpx.AsyncClient(transport=transport, base_url="http://coach") as client:
            headers = {"Authorization": "Bearer token-vicky"}
            first = asyncio.create_task(client.post("/chat", json={"text": "one"}, headers=headers))
            await asyncio.sleep(0.05)
            second = await client.post("/chat", json={"text": "two"}, headers=headers)
            return (await first).status_code, second.status_code

    assert asyncio.run(two_at_once()) == (200, 409)


def test_a_turn_that_takes_too_long_is_cut_off_and_the_empty_conversation_removed():
    client, store, *_ = make(llm=SlowLlm(script=[say("late")]), timeout_s=0.05)
    reply = post(client, {"text": "hi"})
    assert reply.status_code == 504 and store.tables.get("chat_threads", []) == []


# ------------------------------------------------------------ failures say nothing private
def test_an_internal_error_gives_a_plain_message_and_the_log_holds_only_the_error_type(caplog):
    client, store, *_ = make(llm=BoomLlm())
    with caplog.at_level(logging.DEBUG):
        reply = post(client, {"text": SECRET_TEXT})
    assert reply.status_code == 500 and reply.json() == {"error": "Something went wrong. Please try again."}
    everything = reply.text + caplog.text
    assert SECRET_TEXT not in everything and "token-vicky" not in everything and "upstream failure" not in everything
    assert "RuntimeError" in caplog.text and store.tables.get("chat_threads", []) == []


def test_the_loud_third_party_loggers_are_silenced_because_they_print_error_messages():
    make()
    for name in ("google_adk", "google_genai", "LiteLLM", "litellm"):
        assert logging.getLogger(name).getEffectiveLevel() >= logging.CRITICAL


def test_a_normal_turn_logs_nothing_that_holds_the_message_or_the_token(caplog):
    client, *_ = make([say("an answer with private words")])
    with caplog.at_level(logging.DEBUG, logger="coach"):
        post(client, {"text": SECRET_TEXT})
    assert SECRET_TEXT not in caplog.text and "token-vicky" not in caplog.text and "private words" not in caplog.text


def test_a_missing_setting_is_named_but_a_value_is_never_printed(monkeypatch):
    from coach.api import _need
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    with pytest.raises(SystemExit) as err:
        _need("SUPABASE_URL")
    assert str(err.value) == "SUPABASE_URL is not set."
    monkeypatch.setenv("SUPABASE_URL", "  https://secret.example  ")
    assert _need("SUPABASE_URL") == "https://secret.example"
