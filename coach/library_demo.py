"""Lesson 6 demo: index the sample documents, test what search finds, then let the coach use search_library.

Everything sent to OpenRouter is invented: the two sample documents and the questions below. No health data, no notes.
The only thing written to the real database is the sample chunks (kind 'sample') and the cost receipts in llm_calls.
The chat memory for the coach questions lives in the computer's memory.
  uv run --python 3.12 python -m coach.library_demo          dry run, shows what it would do
  uv run --python 3.12 python -m coach.library_demo --run    makes the real calls (a fraction of a cent)
"""
import argparse
import asyncio
import os
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv
from google.adk.models.lite_llm import LiteLlm

from coach.chat import run_turn
from coach.citations import check_citations, cited_refs
from coach.embeddings import openrouter_post
from coach.first_call import MODEL
from coach.guard import ModelGuard
from coach.library import MAX_DISTANCE, index_document, search
from coach.library_tools import ref_for
from coach.llm_log import cap_for, month_spend
from coach.memory import add_fact, create_thread
from coach.registry import Readers, Writers
from coach.tests.fakes import FakeStore
from ingest.import_plan import find_owner

SAMPLES = Path(__file__).parent / "library_samples"
DOCUMENTS = {"schema_guide": "schema_guide.md", "question_sql_examples": "question_sql_examples.md"}

# (question, a piece of the heading that should come first, or None when the library has no answer)
RETRIEVAL_TESTS = [
    ("Which table stores each run, and what columns does it have?", "runs"),
    ("Is pace saved in the database?", "runs"),
    ("What does a missing sleep number mean?", "health_daily"),
    ("Give me SQL for my weekly distance", "How far did I run each week"),
    ("How is a new plan from the model stored?", "plan_versions"),
    ("What does the model call log record?", "llm_calls"),
    ("How much protein should a marathon runner eat?", None),
    ("What is the capital of France?", None),
    ("Which stretches help with shin splints?", None),
]
CHAT_QUESTIONS = [
    "How does the app store my runs, and is pace saved?",
    "How much protein should I eat while training for a marathon?",
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", action="store_true")
    args = parser.parse_args()
    load_dotenv()
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    owner = find_owner(sb)
    print(f"Spent this month ${month_spend(sb, owner):.6f} of a ${cap_for(sb, owner)} cap. Distance limit in use: {MAX_DISTANCE}.")
    if not args.run:
        print("Dry run. Add --run to index the two sample documents and ask the questions.")
        return
    post = openrouter_post()

    print("\n1. INDEX the sample documents (unchanged chunks are skipped, so this is safe to repeat).")
    for source, filename in DOCUMENTS.items():
        r = index_document(sb, owner, source, (SAMPLES / filename).read_text(), kind="sample", post=post)
        print(f"  {source}: {r.added} embedded, {r.unchanged} unchanged, {r.removed} removed, {r.tokens} tokens, ${r.cost:.8f}")

    print("\n2. RETRIEVAL ONLY (no chat model). Top 3 chunks per question with their distance (0 is identical).")
    answerable, unanswerable = [], []
    for question, expected in RETRIEVAL_TESTS:
        hits = search(sb, owner, question, post=post, k=3, max_distance=2.0)
        top = hits[0]
        right = expected is not None and expected.lower() in (top.heading + top.body).lower()
        (answerable if expected else unanswerable).append(top.distance)
        mark = "-" if expected is None else ("RIGHT" if right else "WRONG")
        kept = "kept" if top.distance <= MAX_DISTANCE else "left out"
        print(f"  [{mark}] {question}\n        best: {top.distance:.3f} ({kept}) {top.heading}"
              f"\n        next: {', '.join(f'{h.distance:.3f} {h.heading}' for h in hits[1:])}")
    print(f"  Best distance for questions the library can answer: {min(answerable):.3f} to {max(answerable):.3f}.")
    print(f"  Best distance for questions it cannot: {min(unanswerable):.3f} to {max(unanswerable):.3f}.")

    print("\n3. THE COACH with the search_library tool (Luna, chat memory held in the computer's memory).")
    llm = LiteLlm(model=f"openrouter/{MODEL}")
    for question in CHAT_QUESTIONS:
        seen: set[str] = set()

        def library(q: str, _seen=seen):
            hits = search(sb, owner, q, post=post)
            _seen.update(ref_for(h) for h in hits)
            return hits

        readers = Readers(health=lambda a, b: [], runs=lambda a, b: [], plan_day=lambda d: None, library=library)
        memory = FakeStore()
        guard = ModelGuard(sb, owner, purpose="library_demo", model=MODEL)
        writers = Writers(save_fact=lambda fact: add_fact(memory, owner, fact, "chat"))
        result = asyncio.run(run_turn(memory, owner, create_thread(memory, owner), question, llm=llm, guard=guard,
                                      readers=readers, writers=writers))
        print(f"  You: {question}\n  Coach: {result.reply.strip()}")
        print(f"  tools used: {result.tools_used or 'none'} | refs returned: {sorted(seen) or 'none'} | "
              f"refs cited: {cited_refs(result.reply) or 'none'}")
        print(f"  citation check: {check_citations(result.reply, seen) or 'ok'} | cost ${Decimal(guard.last_cost):.6f}\n")
    print(f"Spent this month now ${month_spend(sb, owner):.6f}.")


if __name__ == "__main__":
    main()
