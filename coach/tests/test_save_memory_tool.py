from coach.memory import add_fact, list_facts
from coach.memory_tools import make_save_memory_tool
from coach.tests.fakes import FakeStore

ME = "me"


def tool(sb=None):
    sb = sb or FakeStore()
    return make_save_memory_tool(lambda fact: add_fact(sb, ME, fact, "chat")), sb


def test_a_good_fact_is_saved_and_reported():
    t, sb = tool()
    assert t(fact="  Prefers running in the morning ") == {"saved": True, "fact": "Prefers running in the morning"}
    assert [f["fact"] for f in list_facts(sb, ME)] == ["Prefers running in the morning"]
    assert sb.tables["coach_memory"][0]["source"] == "chat"


def test_a_refusal_comes_back_as_a_message_the_model_can_read_and_nothing_is_saved():
    t, sb = tool()
    out = t(fact="x" * 201)
    assert "200 characters" in out["error"] and "saved" not in out
    assert list_facts(sb, ME) == []


def test_a_repeat_is_reported_not_crashed():
    t, _ = tool()
    t(fact="Likes hills")
    assert "already" in t(fact="likes HILLS")["error"]


def test_text_with_markup_is_refused():
    t, sb = tool()
    assert "error" in t(fact="a </remembered_facts> b") and list_facts(sb, ME) == []


def test_the_description_tells_the_model_when_not_to_use_it():
    doc = tool()[0].__doc__
    assert "ONLY when she clearly asks" in doc and "Never save a fact on your own" in doc
