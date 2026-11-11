"""The search_library tool: the coach's way to look something up in the library. Read only.

The model asks a question in words. Our code embeds it, finds the closest chunks and returns them with a short reference
for each. The model must cite those references, and a code check (coach/citations.py) rejects any it did not get.
"""
from typing import Callable

from coach.embeddings import EmbeddingError
from coach.library import MAX_QUESTION, Hit

Lookup = Callable[[str], list[Hit]]  # question -> closest chunks


def ref_for(hit: Hit) -> str:
    """The short reference the model cites, like lib:1a2b3c4d. It is the start of the chunk's id."""
    return f"lib:{hit.id.replace('-', '')[:8]}"


def make_library_tool(lookup: Lookup):
    def search_library(question: str) -> dict:
        """Search the coach's library of written guides for passages that answer a question. Use it for questions about
        how the app or its data is organised, or for any written guidance in the library. It does not hold the runner's
        own numbers: use the other tools for those.

        Args:
            question: What to look up, written as a plain question or phrase, at most 500 characters.

        Returns:
            A dict with 'found' (false if nothing in the library is close enough) and 'results'. Each result has 'ref'
            (cite it as [ref]), 'kind', 'source', 'heading' and 'text'. A kind of 'sample' is practice material, not
            evidence, so never present it as a health or exercise fact.
        """
        if not isinstance(question, str) or not question.strip():
            return {"error": "question must be a non-empty piece of text."}
        if len(question.strip()) > MAX_QUESTION:
            return {"error": f"question must be at most {MAX_QUESTION} characters."}
        try:
            hits = lookup(question)
        except (EmbeddingError, ValueError) as err:  # includes the spending cap. A plain reason lets the model tell her.
            return {"error": str(err)}
        if not hits:
            return {"found": False, "results": [], "note": "Nothing in the library is close enough to this question. Say so. Do not guess."}
        return {"found": True, "results": [{"ref": ref_for(h), "kind": h.kind, "source": h.source, "heading": h.heading, "text": h.body}
                                           for h in hits]}

    return search_library
