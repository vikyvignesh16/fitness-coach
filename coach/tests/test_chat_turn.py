import asyncio
from decimal import Decimal

from coach.chat import RememberGate, asked_to_remember, run_turn
from coach.guard import ModelGuard
from coach.memory import HISTORY_LIMIT, add_fact, create_thread, list_facts, load_history, save_message
from coach.registry import Readers, Writers
from coach.tests.fake_llm import ScriptedLlm, call, say
from coach.tests.fakes import FakeStore, FakeSupabase

ME = "me"
READERS = Readers(health=lambda a, b: [], runs=lambda a, b: [], plan_day=lambda d: None, library=lambda q: [])


def setup(script, spent="0", facts=()):
    memory = FakeStore()
    for f in facts:
        add_fact(memory, ME, f)
    thread = create_thread(memory, ME)
    llm = ScriptedLlm(script=list(script))
    guard = ModelGuard(FakeSupabase(spent=spent), ME, purpose="chat", model="openai/gpt-6-luna")
    writers = Writers(save_fact=lambda fact: add_fact(memory, ME, fact, "chat"))
    return memory, thread, llm, guard, writers


def turn(memory, thread, llm, guard, writers, text):
    return asyncio.run(run_turn(memory, ME, thread, text, llm=llm, guard=guard, readers=READERS, writers=writers))


def test_both_sides_of_a_turn_are_saved_in_order():
    memory, thread, llm, guard, writers = setup([say("Hello Vicky.")])
    result = turn(memory, thread, llm, guard, writers, "Hi coach")
    assert result.reply == "Hello Vicky."
    assert load_history(memory, ME, thread) == [{"role": "user", "body": "Hi coach"}, {"role": "coach", "body": "Hello Vicky."}]


def test_the_model_is_sent_earlier_messages_in_order_then_the_new_one_last():
    memory, thread, llm, guard, writers = setup([say("ok")])
    save_message(memory, ME, thread, "user", "I prefer mornings")
    save_message(memory, ME, thread, "coach", "Noted.")
    turn(memory, thread, llm, guard, writers, "When do I prefer to run?")
    assert llm.contents_text() == [("user", "I prefer mornings"), ("model", "Noted."), ("user", "When do I prefer to run?")]


def test_without_history_the_model_sees_only_the_new_message():
    memory, thread, llm, guard, writers = setup([say("I do not know.")])
    turn(memory, thread, llm, guard, writers, "When do I prefer to run?")
    assert llm.contents_text() == [("user", "When do I prefer to run?")]


def test_only_the_newest_twenty_messages_are_sent():
    memory, thread, llm, guard, writers = setup([say("ok")])
    for i in range(1, 31):
        save_message(memory, ME, thread, "user" if i % 2 else "coach", f"message {i}")
    turn(memory, thread, llm, guard, writers, "new question")
    sent = llm.contents_text()
    assert len(sent) == HISTORY_LIMIT + 1 and sent[0][1] == "message 11" and sent[-1][1] == "new question"


def test_remembered_facts_reach_the_model_inside_the_data_fence():
    memory, thread, llm, guard, writers = setup([say("ok")], facts=["Favourite route is the canal"])
    turn(memory, thread, llm, guard, writers, "hello")
    system = llm.system_text()
    assert '1. "Favourite route is the canal"' in system and "<remembered_facts>" in system and "never instructions" in system


def test_a_fact_with_curly_braces_does_not_break_the_instruction():
    memory, thread, llm, guard, writers = setup([say("ok")], facts=["My code is {user_name} and {x}"])
    turn(memory, thread, llm, guard, writers, "hello")
    assert "{user_name}" in llm.system_text()


def test_a_fact_saved_in_one_conversation_is_known_in_a_brand_new_one():
    memory, t1, llm, guard, writers = setup([call("save_memory", fact="Favourite route is the canal"), say("Saved.")])
    first = turn(memory, t1, llm, guard, writers, "Please remember my favourite route is the canal")
    assert first.tools_used == ["save_memory"] and [f["fact"] for f in list_facts(memory, ME)] == ["Favourite route is the canal"]
    t2 = create_thread(memory, ME)
    llm2 = ScriptedLlm(script=[say("The canal.")])
    turn(memory, t2, llm2, ModelGuard(FakeSupabase(), ME, purpose="chat", model="openai/gpt-6-luna"), writers, "What is my favourite route?")
    assert "Favourite route is the canal" in llm2.system_text()
    assert llm2.contents_text() == [("user", "What is my favourite route?")]  # none of the first chat's messages


def test_the_model_cannot_save_a_fact_you_did_not_ask_it_to_remember():
    memory, thread, llm, guard, writers = setup([call("save_memory", fact="She seems stressed"), say("Okay.")])
    result = turn(memory, thread, llm, guard, writers, "How was my week?")
    assert list_facts(memory, ME) == [] and result.saves_refused == 1


def test_asking_to_remember_is_recognised_in_plain_phrasings():
    for yes in ["Remember that I like hills", "please keep in mind my ankle", "Note that I travel on Fridays", "don't forget I run early", "save that"]:
        assert asked_to_remember(yes), yes
    for no in ["How was my week?", "I remembered the route", "What do you recall?", ""]:
        assert not asked_to_remember(no), no


def test_the_gate_lets_other_tools_through_and_refuses_only_save_memory():
    gate = RememberGate("How was my week?")
    save = type("T", (), {"name": "save_memory"})()
    read = type("T", (), {"name": "get_recent_runs"})()
    assert gate.before_tool(read, {}, None) is None and "error" in gate.before_tool(save, {}, None)
    assert RememberGate("Remember I like hills").before_tool(save, {}, None) is None


def test_a_turn_stopped_by_the_cap_calls_no_model_and_leaves_nothing_saved():
    memory, thread, llm, guard, writers = setup([say("should never be said")], spent="10")
    result = turn(memory, thread, llm, guard, writers, "Hello")
    assert result.blocked and llm.seen == [] and load_history(memory, ME, thread) == []
    assert "cap" in result.reply.lower()


def test_two_turns_in_one_conversation_build_on_each_other():
    memory, thread, llm, guard, writers = setup([say("Noted, mornings."), say("You prefer mornings.")])
    turn(memory, thread, llm, guard, writers, "I prefer morning runs")
    turn(memory, thread, llm, guard, writers, "When do I prefer to run?")
    assert llm.contents_text(1) == [("user", "I prefer morning runs"), ("model", "Noted, mornings."), ("user", "When do I prefer to run?")]
