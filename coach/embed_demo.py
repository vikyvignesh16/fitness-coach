"""Lesson 6 demo: one real embedding call with invented sentences. Shows that similar meaning gives close numbers.

Dry run by default. Add --run to make the real call (about 30 tokens, a fraction of a cent).
"""
import argparse
import math
import os

from dotenv import load_dotenv

from coach.embeddings import MODEL, embed, openrouter_post
from coach.llm_log import cap_for, month_spend

SENTENCES = [
    "An easy run should feel comfortable enough to hold a conversation.",
    "Slow, relaxed jogging is meant to feel gentle, so you can chat while you go.",
    "The database stores one row per planned training day.",
]


def cosine(a: list[float], b: list[float]) -> float:
    """1.0 means the same direction (same meaning), 0 means unrelated."""
    return sum(x * y for x, y in zip(a, b)) / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", action="store_true", help="make the real call")
    args = parser.parse_args()
    load_dotenv()
    from supabase import create_client
    from ingest.import_plan import find_owner
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    owner = find_owner(sb)
    print(f"Model {MODEL}. Spent this month ${month_spend(sb, owner):.6f} of a ${cap_for(sb, owner)} cap.")
    if not args.run:
        print("Dry run. Add --run to make the call.")
        return
    out = embed(sb, owner, SENTENCES, post=openrouter_post(), purpose="embed_demo")
    print(f"Got {len(out.vectors)} embeddings of {len(out.vectors[0])} numbers each. {out.tokens} tokens, cost ${out.cost:.8f}.")
    print("First five numbers of sentence 1:", [round(x, 4) for x in out.vectors[0][:5]])
    for i, j in ((0, 1), (0, 2), (1, 2)):
        print(f"Sentences {i + 1} and {j + 1}: closeness {cosine(out.vectors[i], out.vectors[j]):.3f}")


if __name__ == "__main__":
    main()
