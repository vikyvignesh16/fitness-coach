from coach.citations import check_citations, cited_refs, refs_in_tool_results

RESULT = {"found": True, "results": [{"ref": "lib:1a2b3c4d", "text": "x"}, {"ref": "lib:deadbeef", "text": "y"}]}


def test_refs_are_collected_from_every_search_result_of_a_turn():
    assert refs_in_tool_results([RESULT, {"found": False, "results": []}, {"error": "x"}, {"days": []}]) == {"lib:1a2b3c4d", "lib:deadbeef"}


def test_an_answer_citing_only_received_refs_passes():
    assert check_citations("Runs have one row each [lib:1a2b3c4d]. Pace is worked out [lib:deadbeef].", {"lib:1a2b3c4d", "lib:deadbeef"}) == []


def test_an_answer_with_no_citations_passes_this_check():
    assert check_citations("Hello.", set()) == []  # whether a claim NEEDS a citation is a different check


def test_a_made_up_ref_is_rejected():
    assert check_citations("Yes [lib:00000000].", {"lib:1a2b3c4d"}) == ["[lib:00000000] was not returned by a library search in this turn."]


def test_a_ref_from_a_search_that_was_not_made_this_turn_is_rejected():
    assert check_citations("Yes [lib:1a2b3c4d].", set())


def test_malformed_refs_are_rejected_not_ignored():
    for bad in ["[lib:xyz]", "[lib:1A2B3C4D]", "[lib:1a2b3c4]", "[lib:1a2b3c4d5]", "[lib:]"]:
        problems = check_citations(f"Yes {bad}.", {bad[1:-1], "lib:1a2b3c4d"})  # even if the model "received" it, the shape is wrong
        assert problems and "not a valid reference" in problems[0], bad


def test_each_bad_ref_is_reported_once():
    assert len(check_citations("[lib:00000000] and again [lib:00000000]", set())) == 1


def test_cited_refs_ignores_ordinary_brackets():
    assert cited_refs("See [1] and [note] and [lib:1a2b3c4d].") == ["lib:1a2b3c4d"]
