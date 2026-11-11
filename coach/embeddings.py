"""Lesson 6, step 3: turning text into numbers (embeddings).

An embedding is a list of 1536 numbers that captures what a piece of text means. Two texts about the same thing get
numbers that are close together. That is the whole trick behind RAG: embed the chunks once, embed the question when it
arrives, and find the chunks closest to the question.

This is not a chat call, so ADK is not involved. It is one plain web request to OpenRouter's embeddings endpoint.
It follows the same rules as the guard: check the spending cap first, log the cost after, never log the text or the key.
The web request is passed in as a function, so tests use a fake and cost nothing.
"""
import math
import os
from dataclasses import dataclass
from decimal import Decimal
from typing import Callable

import httpx

from coach.budget import check_cap, cost_usd
from coach.llm_log import cap_for, month_spend, record_call

MODEL = "openai/text-embedding-3-small"
DIMENSIONS = 1536  # the size of the vector column in library_chunks. A different size would be refused by the database.
MAX_TEXTS = 64  # per request, so one slip cannot send a huge bill
MAX_TEXT_CHARS = 2000  # the same limit the database puts on a chunk
URL = "https://openrouter.ai/api/v1/embeddings"

Post = Callable[[dict], dict]  # takes the request body, returns the answer as a dict


class EmbeddingError(RuntimeError):
    """The embedding could not be made. The message is plain and never holds the key or the text."""


class CapReached(EmbeddingError):
    """The monthly spending cap stopped the call before it was made."""


@dataclass(frozen=True)
class Embedded:
    vectors: list[list[float]]  # one per text, in the same order as the texts
    tokens: int
    cost: Decimal


def openrouter_post(api_key: str | None = None, timeout: float = 30.0) -> Post:
    """The real web request. The key comes from the environment and goes only into the request header."""
    key = api_key or os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise EmbeddingError("OPENROUTER_API_KEY is not set.")

    def post(body: dict) -> dict:
        try:
            reply = httpx.post(URL, json=body, headers={"Authorization": f"Bearer {key}"}, timeout=timeout)
            reply.raise_for_status()
            return reply.json()
        except httpx.HTTPStatusError as err:  # the status code only: the reply body could echo the input
            raise EmbeddingError(f"OpenRouter answered with status {err.response.status_code}.") from None
        except (httpx.HTTPError, ValueError) as err:
            raise EmbeddingError(f"The embedding request failed ({type(err).__name__}).") from None

    return post


def _check_texts(texts: list[str]) -> None:
    if not texts:
        raise ValueError("There is nothing to embed.")
    if len(texts) > MAX_TEXTS:
        raise ValueError(f"At most {MAX_TEXTS} texts per request, but got {len(texts)}.")
    for text in texts:
        if not isinstance(text, str) or not text.strip():
            raise ValueError("Every text to embed must be a non-empty string.")
        if len(text) > MAX_TEXT_CHARS:
            raise ValueError(f"A text to embed can be at most {MAX_TEXT_CHARS} characters, but one has {len(text)}.")


def _read_vectors(answer: dict, expected: int) -> tuple[list[list[float]], int]:
    """Check the answer is what we asked for. A wrong count or size is an error, never padded or trimmed."""
    try:
        items = sorted(answer["data"], key=lambda item: item["index"])
        vectors = [item["embedding"] for item in items]
        tokens = int(answer["usage"]["prompt_tokens"])
    except (KeyError, TypeError, ValueError):
        raise EmbeddingError("The embedding answer was not in the expected shape.") from None
    if len(vectors) != expected or [item["index"] for item in items] != list(range(expected)):
        raise EmbeddingError(f"Asked for {expected} embeddings but the answer holds {len(vectors)}.")
    for vector in vectors:
        if not isinstance(vector, list) or len(vector) != DIMENSIONS:
            raise EmbeddingError(f"Each embedding must have {DIMENSIONS} numbers.")
        if not all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) for x in vector):
            raise EmbeddingError("An embedding held something that is not a finite number.")
    return vectors, tokens


def embed(sb, user_id: str, texts: list[str], *, post: Post, purpose: str = "embed",
          cap_override: Decimal | None = None) -> Embedded:
    """Embed a list of texts. Checks the cap first, logs the cost after, whatever happens."""
    _check_texts(texts)
    cap = cap_override if cap_override is not None else cap_for(sb, user_id)
    decision = check_cap(month_spend(sb, user_id), cap)
    if not decision.allowed:
        record_call(sb, user_id, purpose=purpose, model=MODEL, input_tokens=None, output_tokens=None,
                    cost=Decimal("0"), ok=False, error="cap_reached")
        raise CapReached(decision.reason)
    try:
        answer = post({"model": MODEL, "input": texts})
        vectors, tokens = _read_vectors(answer, len(texts))
    except EmbeddingError as err:
        record_call(sb, user_id, purpose=purpose, model=MODEL, input_tokens=None, output_tokens=None,
                    cost=Decimal("0"), ok=False, error=str(err))
        raise
    cost = cost_usd(MODEL, tokens, 0)
    record_call(sb, user_id, purpose=purpose, model=MODEL, input_tokens=tokens, output_tokens=0, cost=cost, ok=True)
    return Embedded(vectors=vectors, tokens=tokens, cost=cost)
