"""Lesson 6, step 4: the library. Put documents in (index) and find the closest chunks for a question (search).

index_document is a job that a person runs, like the plan import. It is not a tool the model can call.
search is what the search_library tool will use in the next step.

Chunks are matched to their old rows by position. Unchanged chunks (same text, kind and model) are not embedded again,
so re-running an index costs nothing. This is simple and right for a small library. A big edit near the top of a
document shifts every position, so everything after it is embedded again, which is still only a fraction of a cent.
"""
from dataclasses import dataclass
from decimal import Decimal

from coach.chunking import chunk_markdown
from coach.embeddings import MAX_TEXTS, MODEL, Post, embed

KINDS = ("sample", "evidence")
MAX_SOURCE = 120
MAX_HEADING = 200  # the database column allows this many
MAX_QUESTION = 500
DEFAULT_K = 4
MAX_K = 10  # the database function clamps to this too
# Cosine distance is 1 minus closeness. 0 is identical, around 1 is unrelated. A chunk further away than this is not
# returned, so the coach can say the library does not cover a question. This number is a first guess that step 6 tests
# against real questions, and it can move. It lives here in code, never in a prompt.
MAX_DISTANCE = 0.65


@dataclass(frozen=True)
class IndexResult:
    added: int  # new or changed chunks that were embedded and written
    unchanged: int
    removed: int  # old chunks past the end of the document
    tokens: int
    cost: Decimal


@dataclass(frozen=True)
class Hit:
    id: str
    source: str
    kind: str
    heading: str
    body: str
    distance: float


def index_document(sb, owner: str, source: str, text: str, *, kind: str, post: Post,
                   cap_override: Decimal | None = None) -> IndexResult:
    """Cut a document into chunks, embed the new or changed ones, and store them. Safe to repeat."""
    if kind not in KINDS:
        raise ValueError(f"kind must be one of {KINDS}, not {kind!r}.")
    if not source or len(source) > MAX_SOURCE:
        raise ValueError(f"source must be 1 to {MAX_SOURCE} characters.")
    chunks = chunk_markdown(text)
    if not chunks:
        raise ValueError("The document has no text to index.")

    old = {r["chunk_index"]: r for r in sb.table("library_chunks")
           .select("chunk_index, body_hash, kind, embedding_model").eq("user_id", owner).eq("source", source).execute().data}
    todo = [(i, c) for i, c in enumerate(chunks)
            if not ((row := old.get(i)) and row["body_hash"] == c.body_hash() and row["kind"] == kind
                    and row["embedding_model"] == MODEL)]

    tokens, cost = 0, Decimal("0")
    for start in range(0, len(todo), MAX_TEXTS):
        batch = todo[start:start + MAX_TEXTS]
        done = embed(sb, owner, [c.embed_text() for _, c in batch], post=post, purpose="embed_library", cap_override=cap_override)
        tokens, cost = tokens + done.tokens, cost + done.cost
        rows = [{"user_id": owner, "source": source, "kind": kind, "heading": c.heading[:MAX_HEADING], "chunk_index": i,
                 "body": c.body, "body_hash": c.body_hash(), "embedding": vector, "embedding_model": MODEL}
                for (i, c), vector in zip(batch, done.vectors)]
        sb.table("library_chunks").upsert(rows, on_conflict="user_id,source,chunk_index").execute()

    removed = [i for i in old if i >= len(chunks)]
    if removed:
        sb.table("library_chunks").delete().eq("user_id", owner).eq("source", source).gte("chunk_index", len(chunks)).execute()
    return IndexResult(added=len(todo), unchanged=len(chunks) - len(todo), removed=len(removed), tokens=tokens, cost=cost)


def search(sb, owner: str, question: str, *, post: Post, k: int = DEFAULT_K, max_distance: float = MAX_DISTANCE,
           only_kind: str | None = None, cap_override: Decimal | None = None, log_sb=None) -> list[Hit]:
    """The chunks closest in meaning to the question, closest first. Chunks further than max_distance are left out.

    sb runs the vector search. In the deployed service that is the signed in user's client, so Row Level Security applies.
    log_sb is the client that checks the cap and writes the cost receipt. Those tables only the service may write, so it
    is a separate (service role) client. When log_sb is not given, sb does both, as in the demos.
    """
    text = (question or "").strip() if isinstance(question, str) else ""
    if not text:
        raise ValueError("The question cannot be empty.")
    if len(text) > MAX_QUESTION:
        raise ValueError(f"The question can be at most {MAX_QUESTION} characters.")
    if isinstance(k, bool) or not isinstance(k, int) or not 1 <= k <= MAX_K:
        raise ValueError(f"k must be a whole number from 1 to {MAX_K}.")
    if only_kind is not None and only_kind not in KINDS:
        raise ValueError(f"only_kind must be one of {KINDS}.")
    vector = embed(log_sb or sb, owner, [text], post=post, purpose="embed_search", cap_override=cap_override).vectors[0]
    rows = sb.rpc("match_library_chunks", {"query_embedding": vector, "match_count": k, "only_kind": only_kind}).execute().data
    hits = [Hit(r["id"], r["source"], r["kind"], r["heading"], r["body"], float(r["distance"])) for r in rows]
    return sorted((h for h in hits if h.distance <= max_distance), key=lambda h: h.distance)[:k]
