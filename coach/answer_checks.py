"""Lesson 7: checks on the coach's ANSWER, written as plain functions.

The earlier lessons protect what goes in (the cap, the tool rules, the memory gate). These check what comes out.
They are blunt on purpose: no model judges the answer, so they cost nothing, give the same result every time, and cannot
be talked round. A check returns plain problems. It never edits the answer. The chat turn sends the problems back to the
model for one revision, and uses a fixed safe message if the second answer still fails.

Three checks:
  1. pain notice   code makes sure the safety notice is there when the user mentions pain
  2. health claims advice about food, supplements or treatment must cite a returned reference of kind evidence
  3. numbers       every number in the answer must be in the tool results, in what Vicky said, or in a few known facts

Honest limits: the claim check is a word list, so it misses claims in words it does not know and may flag a harmless
sentence. The number check says a number EXISTS in the data, not that it was used correctly. Tests measure both.
"""
import re

from coach.citations import check_citations, refs_in_tool_results

# ---------------------------------------------------------------- pain
PAIN_WORDS = re.compile(
    r"\b(pain|painful|hurt|hurts|hurting|ache|aches|aching|injur\w*|sprain\w*|swollen|swelling|twinge|tendon\w*|shin splints?)\b",
    re.IGNORECASE)
PAIN_NOTICE = ("Safety note: if pain is lasting or getting worse, stop planned training and see a sports physio or clinician. "
               "This is not medical advice.")
PAIN_MARKER = "see a sports physio or clinician"


def mentions_pain(text: str) -> bool:
    return bool(PAIN_WORDS.search(text or ""))


def with_pain_notice(user_text: str, reply: str) -> str:
    """Adds the fixed notice (visibly, at the end) when the user mentioned pain and the reply lacks it. Never rewrites the reply."""
    if mentions_pain(user_text) and PAIN_MARKER not in reply.lower():
        return f"{reply.rstrip()}\n\n{PAIN_NOTICE}"
    return reply


# ---------------------------------------------------------------- health claims
HEALTH_TERMS = re.compile(
    r"\b(protein|carbs?|carbohydrates?|calories?|kcal|macros?|supplements?|creatine|caffeine|vitamins?|iron|electrolytes?|sodium|"
    r"hydrat\w+|dosage|dose|mg|ibuprofen|medication|anti-inflammator\w+|diagnos\w+|treatment|rehab\w*|stretch\w*)\b", re.IGNORECASE)
ADVICE = re.compile(
    r"\b(should|aim|aiming|recommend\w*|try|take|eat|drink|consume|intake|per kg|per kilogram|grams?|will|help\w*|reduce\w*|prevent\w*|"
    r"improve\w*|boost\w*|cure\w*|safe|daily|every|each|weekly|(one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty))\b|\d",
    re.IGNORECASE)
# A sentence that says the library has nothing is not a claim, even if it names the topic.
NOT_COVERED = re.compile(r"(does not|doesn't|do not|don't|cannot|can't|won't|will not)\s+(cover|have|give|provide|offer)|not in (the|my) library", re.IGNORECASE)
SENTENCES = re.compile(r"(?<=[.!?])\s+|\n+")

NO_SOURCE_MESSAGE = ("I don't have a source for that in my library, so I won't give a number or advice on it. "
                     "A sports dietitian or clinician can help.")


def health_claims(reply: str) -> list[str]:
    """Sentences that give food, supplement or treatment advice or numbers. A cited reference of kind evidence is needed for these."""
    return [s.strip() for s in SENTENCES.split(reply or "")
            if HEALTH_TERMS.search(s) and ADVICE.search(s) and not NOT_COVERED.search(s)]


def evidence_refs(tool_results: list[dict]) -> set[str]:
    """References of kind evidence returned this turn. A sample reference never counts as a source for a health claim."""
    return {item["ref"] for result in tool_results if isinstance(result, dict) for item in result.get("results", [])
            if isinstance(item, dict) and item.get("kind") == "evidence" and "ref" in item}


def check_health_claims(reply: str, tool_results: list[dict]) -> list[str]:
    claims = health_claims(reply)
    if not claims:
        return []
    cited = set(re.findall(r"\[(lib:[0-9a-f]{8})\]", reply))
    if cited & evidence_refs(tool_results):
        return []
    return [f'This sentence gives health or nutrition advice without citing an evidence reference: "{claims[0][:120]}"']


# ---------------------------------------------------------------- numbers
KNOWN_FACTS = "Race day 2027-04-04. Goals 3:15, 3:20, 3:30 and a stretch goal of 3:00."  # from the project brief. Dates and times are compared as text
LIST_MARKER = re.compile(r"^\s*\d+[.)]\s", re.MULTILINE)
DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
CLOCK = re.compile(r"\b\d{1,2}:\d{2}\b")
DURATION = re.compile(r"(?<![\w.])(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b(?:\s*(?:and\s*)?(\d+)\s*(?:m|min|mins|minutes?)\b)?", re.IGNORECASE)
MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"
MONTH_DAY = re.compile(rf"(?<![\w.])(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:{MONTHS})\b|\b(?:{MONTHS})\s+(\d{{1,2}})(?:st|nd|rd|th)?(?!\d)", re.IGNORECASE)
NUMBER = re.compile(r"(?<![\w.])(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)")


def _walk(obj, numbers: list[float], strings: list[str]) -> None:
    """Collect every number and string inside tool results. The length of each list counts too ("3 runs")."""
    if isinstance(obj, bool) or obj is None:
        return
    if isinstance(obj, (int, float)):
        numbers.append(float(obj))
    elif isinstance(obj, str):
        strings.append(obj)
        numbers.extend(_numbers_in(CLOCK.sub(" ", DATE.sub(" ", obj))))  # dates and times are compared as whole text, not as loose digits
        try:
            numbers.append(float(obj))
        except ValueError:
            pass
    elif isinstance(obj, dict):
        for v in obj.values():
            _walk(v, numbers, strings)
    elif isinstance(obj, (list, tuple)):
        numbers.append(float(len(obj)))
        for v in obj:
            _walk(v, numbers, strings)


def _numbers_in(text: str) -> list[float]:
    return [float(m.group(0).replace(",", "")) for m in NUMBER.finditer(text)]


def _decimals(token: str) -> int:
    return len(token.split(".")[1]) if "." in token else 0


def _matches(value: float, token: str, sources: list[float]) -> bool:
    """True if `value`, written the way `token` is written, is a correct rounding of something in the sources (or that / 60)."""
    tolerance = 0.5 * 10 ** -_decimals(token) + 1e-9
    return any(abs(value - s) <= tolerance or abs(value - s / 60) <= tolerance for s in sources)


def ungrounded_numbers(reply: str, tool_results: list[dict], tool_args: list[dict], said: list[str]) -> list[str]:
    """Numbers written in the reply that are not found in the sources. `said` is what Vicky wrote, and her remembered facts."""
    numbers: list[float] = []
    strings: list[str] = []
    for obj in (*tool_results, *tool_args):
        _walk(obj, numbers, strings)
    for text in (*said, KNOWN_FACTS):
        numbers.extend(_numbers_in(CLOCK.sub(" ", DATE.sub(" ", text))))
        strings.append(text)
    blob = "\n".join(strings)
    date_days = {int(d.split("-")[2]) for d in DATE.findall(blob)}  # "9 November" is fine if some date in the data is the 9th
    numbers.extend(float(d.split("-")[0]) for d in DATE.findall(blob))  # and so is the year of a date that is in the data

    text = LIST_MARKER.sub("", reply or "")
    problems: list[str] = []

    for date in DATE.findall(text):
        if date not in blob:
            problems.append(f"The date {date} is not in the data.")
    text = DATE.sub(" ", text)

    for match in MONTH_DAY.finditer(text):
        day = int(match.group(1) or match.group(2))
        if day not in date_days:
            problems.append(f"The date {match.group(0)} is not in the data.")
    text = MONTH_DAY.sub(" ", text)

    for clock in CLOCK.findall(text):
        if clock not in blob:
            problems.append(f"The time or pace {clock} is not in the data.")
    text = CLOCK.sub(" ", text)

    for match in DURATION.finditer(text):
        if match.group(2) is not None:  # hours and minutes, like 7 hours 50 minutes: compare the total minutes
            total = float(match.group(1)) * 60 + int(match.group(2))
            if not any(abs(total - n) <= 1 for n in numbers):
                problems.append(f"The duration {match.group(0).strip()} ({total:g} minutes) is not in the data.")
        elif not _matches(float(match.group(1)), match.group(1), numbers):  # hours alone, like 8 hours or 7.8 hours
            problems.append(f"The number {match.group(1)} (hours) is not in the data.")
    text = DURATION.sub(" ", text)

    for token in dict.fromkeys(m.group(0) for m in NUMBER.finditer(text)):
        if not _matches(float(token.replace(",", "")), token.replace(",", ""), numbers):
            problems.append(f"The number {token} is not in the data or in what Vicky said.")
    return problems


# ---------------------------------------------------------------- all together
UNCHECKED_NUMBERS_MESSAGE = ("I could not check some of the numbers in my answer against your data, so I won't show them. "
                             "Please ask again, or look at the numbers in the app.")


def check_answer(reply: str, tool_results: list[dict], tool_args: list[dict], said: list[str]) -> list[str]:
    """Every problem with the reply. An empty list means it passed all checks."""
    return (check_citations(reply, refs_in_tool_results(tool_results))
            + check_health_claims(reply, tool_results)
            + ungrounded_numbers(reply, tool_results, tool_args, said))


def fallback_for(problems: list[str]) -> str:
    """The fixed message used when the revised answer still fails. The words depend on the kind of problem."""
    if any("health or nutrition advice" in p for p in problems):
        return NO_SOURCE_MESSAGE
    return UNCHECKED_NUMBERS_MESSAGE
