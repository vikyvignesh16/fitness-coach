import json

from coach.forms import RunnerNote, check_note

GOOD = {"headline": "Sleep was short and HRV is below your normal.", "readiness": "amber",
        "observations": ["Slept about 6 hours.", "HRV 52 ms, under your 55 to 68 range."], "confidence": 0.6}


def check(**over):
    return check_note(json.dumps({**GOOD, **over}))


def test_a_good_reply_is_accepted():
    note, problems = check()
    assert problems == [] and isinstance(note, RunnerNote) and note.readiness == "amber"


def test_readiness_must_be_one_of_three_words():
    note, problems = check(readiness="purple")
    assert note is None and problems[0].startswith("readiness")


def test_empty_observation_list_is_refused():
    assert check(observations=[])[0] is None


def test_too_many_observations_are_refused():
    assert check(observations=["a"] * 6)[0] is None


def test_a_blank_observation_is_refused():
    assert check(observations=["   "])[0] is None


def test_headline_over_120_characters_is_refused():
    assert check(headline="x" * 121)[0] is None and check(headline="x" * 120)[0] is not None


def test_confidence_must_be_between_zero_and_one():
    assert check(confidence=1.2)[0] is None and check(confidence=-0.1)[0] is None
    assert check(confidence=0)[0] is not None and check(confidence=1)[0] is not None


def test_a_missing_field_is_named_in_the_problem():
    data = {k: v for k, v in GOOD.items() if k != "confidence"}
    note, problems = check_note(json.dumps(data))
    assert note is None and any("confidence" in p for p in problems)


def test_an_extra_field_is_refused():
    assert check(advice="rest more")[0] is None


def test_text_that_is_not_json_is_refused_with_a_message():
    note, problems = check_note("Sure! Here is your note: all good.")
    assert note is None and problems


def test_whitespace_around_text_is_trimmed():
    note, _ = check(headline="  Fine.  ")
    assert note.headline == "Fine."


def test_the_form_describes_itself_to_the_model():
    schema = RunnerNote.model_json_schema()
    assert schema["properties"]["readiness"]["enum"] == ["green", "amber", "red"]
    assert "description" in schema["properties"]["headline"]
