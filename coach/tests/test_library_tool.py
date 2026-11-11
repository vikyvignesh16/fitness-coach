from coach.embeddings import CapReached, EmbeddingError
from coach.instructions import LIBRARY_RULE, build_instructions
from coach.library import Hit
from coach.library_tools import make_library_tool, ref_for

HIT = Hit("1a2b3c4d-1111-2222-3333-444455556666", "schema_guide", "sample", "Guide > runs", "One row per run.", 0.2)


def test_a_hit_comes_back_with_a_short_reference_and_its_kind():
    out = make_library_tool(lambda q: [HIT])("how are runs stored?")
    assert out == {"found": True, "results": [{"ref": "lib:1a2b3c4d", "kind": "sample", "source": "schema_guide",
                                               "heading": "Guide > runs", "text": "One row per run."}]}


def test_the_reference_is_the_first_eight_characters_of_the_id():
    assert ref_for(HIT) == "lib:1a2b3c4d"


def test_nothing_close_enough_says_so_and_tells_the_model_not_to_guess():
    out = make_library_tool(lambda q: [])("capital of France")
    assert out["found"] is False and out["results"] == [] and "Do not guess" in out["note"]


def test_the_question_is_passed_on_unchanged():
    seen = []
    make_library_tool(lambda q: seen.append(q) or [])("  how are runs stored?  ")
    assert seen == ["  how are runs stored?  "]  # the search itself trims. The tool does not rewrite the question


def test_the_cap_and_web_failures_become_plain_errors_not_crashes():
    def broke(reason):
        def lookup(q): raise reason
        return lookup
    assert make_library_tool(broke(CapReached("Monthly cap of $10 reached.")))("x") == {"error": "Monthly cap of $10 reached."}
    assert "status 500" in make_library_tool(broke(EmbeddingError("OpenRouter answered with status 500.")))("x")["error"]


def test_the_instruction_tells_the_coach_to_cite_and_not_to_treat_samples_as_evidence():
    assert "cite it as [ref]" in LIBRARY_RULE and "Cite only references a search returned" in LIBRARY_RULE
    assert "not evidence" in LIBRARY_RULE and "does not cover it" in LIBRARY_RULE
    assert LIBRARY_RULE in build_instructions([])
