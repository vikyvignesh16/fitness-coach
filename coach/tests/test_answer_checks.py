import pytest

from coach.answer_checks import (NO_SOURCE_MESSAGE, PAIN_NOTICE, UNCHECKED_NUMBERS_MESSAGE, check_answer, check_health_claims,
                                 evidence_refs, fallback_for, health_claims, mentions_pain, ungrounded_numbers, with_pain_notice)

HEALTH = {"days": [
    {"day": "2026-11-08", "sleep_asleep_min": 470, "hrv_avg_ms": 52, "resting_hr": 49, "flags": []},
    {"day": "2026-11-09", "sleep_asleep_min": 345, "hrv_avg_ms": 38, "resting_hr": 54, "flags": ["slept under 6 hours"]},
], "summary": {"short_sleep_nights": 1}, "days_without_data": 5}
RUNS = {"runs": [{"date": "2026-11-09", "distance_km": 18.2, "pace": "5:41 /km", "avg_hr": 148, "training_load": 96, "felt": "Hard"}],
        "runs_in_range": 1, "truncated": False}
SAMPLE = {"found": True, "results": [{"ref": "lib:7ced167e", "kind": "sample", "text": "Pace is not stored."}]}
EVIDENCE = {"found": True, "results": [{"ref": "lib:aaaa1111", "kind": "evidence", "text": "Protein 1.4 to 2.0 g per kg."}]}
ARGS = [{"days": 7}]


def numbers(reply, results=(HEALTH, RUNS), said=("How did I sleep this week?",), args=ARGS):
    return ungrounded_numbers(reply, list(results), list(args), list(said))


# ------------------------------------------------------------ pain
@pytest.mark.parametrize("text", ["My ankle hurts", "I have shin splints", "my knee is painful", "there is a twinge in my calf",
                                  "It aches after runs", "I think I'm injured", "my foot is swollen", "PAIN in my heel"])
def test_pain_words_are_recognised(text):
    assert mentions_pain(text)


@pytest.mark.parametrize("text", ["How did I sleep?", "What is my plan for Sunday?", "I feel strong today", ""])
def test_no_pain_words_means_no_notice(text):
    assert not mentions_pain(text) and with_pain_notice(text, "Fine.") == "Fine."


def test_the_notice_is_added_at_the_end_when_pain_is_mentioned_and_the_reply_lacks_it():
    out = with_pain_notice("my ankle hurts", "Rest today.")
    assert out == f"Rest today.\n\n{PAIN_NOTICE}" and "see a sports physio or clinician" in out


def test_the_notice_is_not_doubled_when_the_reply_already_says_it():
    reply = "Please stop planned training and see a sports physio or clinician."
    assert with_pain_notice("my ankle hurts", reply) == reply


# ------------------------------------------------------------ health claims
@pytest.mark.parametrize("reply", [
    "Aim for about 1.4 to 2.0 g of protein per kg each day.",
    "You should eat more carbs before long runs.",
    "Take 300 mg of caffeine an hour before the race.",
    "Try a daily creatine supplement.",
    "Stretch for ten minutes after every run.",
    "Ibuprofen will help with that.",
])
def test_health_advice_is_recognised(reply):
    assert health_claims(reply)


@pytest.mark.parametrize("reply", [
    "The coaching library doesn't cover protein targets, so I can't give you a number from it.",
    "I don't have a source for that in my library.",
    "You slept 7 hours 50 minutes and your HRV was 52.",
    "Your long run was 18.2 km at 5:41 /km.",
    "Pace isn't stored; it's worked out from duration and distance.",
    "The library doesn't cover protein, so I can't tell you how much to eat.",  # names the topic and has an advice word, but gives none
    "A sports dietitian can tailor a plan to you.",
    "",
])
def test_ordinary_answers_and_honest_refusals_are_not_health_claims(reply):
    assert health_claims(reply) == []


def test_the_refusal_example_would_be_flagged_without_the_exemption():
    """Guards the guard: the refusal above only passes because of the not-covered rule, so that rule is really being tested."""
    from coach.answer_checks import ADVICE, HEALTH_TERMS
    sentence = "The library doesn't cover protein, so I can't tell you how much to eat."
    assert HEALTH_TERMS.search(sentence) and ADVICE.search(sentence)


def test_advice_with_no_citation_is_a_problem():
    problems = check_health_claims("Aim for 1.4 g of protein per kg.", [EVIDENCE])
    assert len(problems) == 1 and "without citing an evidence reference" in problems[0]


def test_advice_citing_a_returned_evidence_reference_passes():
    assert check_health_claims("Aim for 1.4 to 2.0 g of protein per kg [lib:aaaa1111].", [EVIDENCE]) == []


def test_citing_a_sample_reference_does_not_support_health_advice():
    both = [SAMPLE, EVIDENCE]
    assert check_health_claims("Aim for 1.4 g of protein per kg [lib:7ced167e].", both)


def test_citing_an_evidence_reference_that_was_not_returned_does_not_help():
    assert check_health_claims("Aim for 1.4 g of protein per kg [lib:aaaa1111].", [SAMPLE])


def test_only_evidence_kind_counts_as_a_source():
    assert evidence_refs([SAMPLE, EVIDENCE, {"error": "x"}, {"found": False, "results": []}]) == {"lib:aaaa1111"}


# ------------------------------------------------------------ numbers
@pytest.mark.parametrize("reply", [
    "On 2026-11-08 you slept 470 minutes.",
    "You slept 7 hours 50 minutes on 2026-11-08.",
    "You slept about 8 hours that night.",
    "Your HRV was 52 ms and your resting heart rate was 49.",
    "Your last run was 18.2 km at 5:41 /km with average heart rate 148.",
    "Your last run was about 18 km.",
    "You had 2 days with data and 5 without.",
    "Over the last 7 days one night was short.",
    "Your goals are 3:15, 3:20 and 3:30 for 4 April 2027.",
    "1. Sleep more.\n2. Keep easy runs easy.",
    "The run was hard, with a training load of 96.",
    "You asked about this week.",
])
def test_numbers_that_are_in_the_data_pass(reply):
    assert numbers(reply) == []


@pytest.mark.parametrize("reply,expected", [
    ("You slept 7 hours 52 minutes.", "duration"),
    ("You slept 9 hours.", "9"),
    ("Your HRV was 61 ms.", "61"),
    ("Your long run was 21.1 km.", "21.1"),
    ("Your pace was 5:12 /km.", "5:12"),
    ("On 2026-11-12 you ran.", "2026-11-12"),
    ("Your resting heart rate was 49.7.", "49.7"),
    ("You have 3 hard runs this week.", "3"),
])
def test_numbers_that_are_not_in_the_data_are_caught(reply, expected):
    problems = numbers(reply)
    assert problems and expected in problems[0]


def test_a_number_only_in_what_vicky_said_is_allowed():
    assert numbers("You said you slept 5 hours.", results=[], said=["I slept 5 hours last night"]) == []


def test_a_number_from_the_library_text_is_allowed_if_a_search_returned_it():
    assert numbers("Up to 2.0 g per kg.", results=[EVIDENCE], said=[]) == []


def test_rounding_must_be_correct_for_the_way_it_is_written():
    assert numbers("About 7.8 hours.", results=[HEALTH]) == []  # 470 / 60 = 7.83
    assert numbers("About 7.9 hours.", results=[HEALTH])  # not a correct rounding of 7.83
    assert numbers("About 7 hours.", results=[HEALTH], args=[])  # 7.83 does not round to 7


def test_a_reply_with_no_numbers_has_nothing_to_ground():
    assert numbers("You are doing fine.") == []


# ------------------------------------------------------------ all together
def test_the_invented_protein_answer_from_the_real_demo_fails_two_checks():
    reply = "A common target is about **1.2–1.6 g of protein per kg of body weight per day**."
    problems = check_answer(reply, [SAMPLE], [], ["How much protein should I eat?"])
    assert any("health or nutrition advice" in p for p in problems) and any("1.2" in p for p in problems)


def test_a_good_cited_answer_passes_everything():
    reply = "Aim for about 1.4 to 2.0 g of protein per kg [lib:aaaa1111]."
    assert check_answer(reply, [EVIDENCE], [], ["How much protein?"]) == []


def test_a_made_up_reference_is_a_problem():
    assert check_answer("Pace is not stored [lib:00000000].", [SAMPLE], [], []) != []


def test_the_fallback_message_depends_on_the_kind_of_problem():
    assert fallback_for(["This sentence gives health or nutrition advice without citing an evidence reference: x"]) == NO_SOURCE_MESSAGE
    assert fallback_for(["The number 61 is not in the data or in what Vicky said."]) == UNCHECKED_NUMBERS_MESSAGE


def test_a_small_number_can_match_by_coincidence_and_that_is_a_known_limit():
    """The check says a number EXISTS in the sources. 'days: 7' was a tool argument, so 'about 7 hours' passes even though
    the data says 7.83. Nothing here pretends otherwise. A model judge or a stricter field by field check could close it."""
    assert numbers("About 7 hours.", results=[HEALTH]) == []


def test_an_invented_year_is_caught_but_the_year_of_a_known_date_is_fine():
    assert numbers("Race day is 4 April 2027.") == []
    assert numbers("Race day is 4 April 2028.")


def test_a_day_of_the_month_must_match_a_date_in_the_data():
    assert numbers("You ran on 9 November.") == []
    assert numbers("You ran on November 9th.") == []
    assert numbers("You ran on 20 November.")
