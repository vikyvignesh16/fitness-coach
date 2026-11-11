"""A code check on citations. An answer may only cite references that a search in this same turn returned.

The model writes [lib:1a2b3c4d] after a statement that came from the library. If it makes up a reference, or cites one it
never received, the check says so. This is the same idea as the rule that uncited or unknown evidence ids are rejected.
"""
import re

CITATION = re.compile(r"\[(lib:[0-9a-f]{8})\]")
ANY_BRACKETED_REF = re.compile(r"\[(lib:[^\]]*)\]")  # also catches a malformed one, like [lib:xyz]


def cited_refs(text: str) -> list[str]:
    return [m.group(1) for m in ANY_BRACKETED_REF.finditer(text or "")]


def refs_in_tool_results(results: list[dict]) -> set[str]:
    """Every reference found in the library search results of a turn."""
    return {item["ref"] for result in results if isinstance(result, dict) for item in result.get("results", [])
            if isinstance(item, dict) and "ref" in item}


def check_citations(answer: str, allowed: set[str]) -> list[str]:
    """Plain problems with the answer's citations. An empty list means all cited references were really received."""
    problems = []
    for ref in dict.fromkeys(cited_refs(answer)):
        if not CITATION.fullmatch(f"[{ref}]"):
            problems.append(f"[{ref}] is not a valid reference.")
        elif ref not in allowed:
            problems.append(f"[{ref}] was not returned by a library search in this turn.")
    return problems
