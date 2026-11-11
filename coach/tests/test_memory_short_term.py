import pytest

from coach.memory import HISTORY_LIMIT, MAX_BODY, create_thread, load_history, save_message
from coach.tests.fakes import FakeStore

ME = "me"


def chat():
    sb = FakeStore()
    return sb, create_thread(sb, ME)


def test_a_new_thread_gets_an_id_and_the_title_is_trimmed():
    sb = FakeStore()
    tid = create_thread(sb, ME, "  " + "x" * 200)
    assert tid and len(sb.tables["chat_threads"][0]["title"]) == 80


def test_messages_come_back_oldest_first():
    sb, tid = chat()
    for role, text in [("user", "hello"), ("coach", "hi Vicky"), ("user", "how was my week")]:
        save_message(sb, ME, tid, role, text)
    assert [m["body"] for m in load_history(sb, ME, tid)] == ["hello", "hi Vicky", "how was my week"]
    assert [m["role"] for m in load_history(sb, ME, tid)] == ["user", "coach", "user"]


def test_only_the_newest_twenty_come_back_and_still_in_order():
    sb, tid = chat()
    for i in range(1, 31):
        save_message(sb, ME, tid, "user", f"message {i}")
    history = load_history(sb, ME, tid)
    assert len(history) == HISTORY_LIMIT == 20
    assert history[0]["body"] == "message 11" and history[-1]["body"] == "message 30"


def test_a_conversation_never_sees_another_conversations_messages():
    sb, a = chat()
    b = create_thread(sb, ME)
    save_message(sb, ME, a, "user", "about running")
    save_message(sb, ME, b, "user", "about food")
    assert [m["body"] for m in load_history(sb, ME, a)] == ["about running"]


def test_another_users_messages_are_not_loaded():
    sb, tid = chat()
    save_message(sb, ME, tid, "user", "mine")
    assert load_history(sb, "someone-else", tid) == []


def test_an_empty_conversation_gives_an_empty_list():
    sb, tid = chat()
    assert load_history(sb, ME, tid) == []


def test_bad_messages_are_refused_before_the_database():
    sb, tid = chat()
    for role, body in [("robot", "hi"), ("user", ""), ("user", "   "), ("user", "x" * (MAX_BODY + 1))]:
        with pytest.raises(ValueError):
            save_message(sb, ME, tid, role, body)
    assert "chat_messages" not in sb.tables


def test_the_limit_is_twenty_written_out_not_read_from_the_code():
    assert HISTORY_LIMIT == 20 and MAX_BODY == 4000
