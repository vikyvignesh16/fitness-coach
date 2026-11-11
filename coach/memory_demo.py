"""Lesson 5 demo: an agent that forgets, then remembers. Needs --run because the calls cost a (tiny) amount of money.

The chat memory lives in the computer's memory for this demo, so your real chat tables stay empty and nothing personal is sent.
Only the cost receipts are written to the real llm_calls table.
  uv run --python 3.12 python -m coach.memory_demo --run
"""
import argparse
import asyncio
import os

from dotenv import load_dotenv
from google.adk.models.lite_llm import LiteLlm

from coach.chat import run_turn
from coach.first_call import MODEL
from coach.guard import ModelGuard
from coach.llm_log import cap_for, month_spend
from coach.memory import add_fact, create_thread, list_facts
from coach.registry import Readers, Writers
from coach.tests.fakes import FakeStore
from ingest.import_plan import find_owner

READERS = Readers(health=lambda a, b: [], runs=lambda a, b: [], plan_day=lambda d: None)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", action="store_true")
    args = parser.parse_args()
    load_dotenv()
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    owner = find_owner(sb)
    print(f"Model {MODEL}. Spent this month ${month_spend(sb, owner):.6f} of a ${cap_for(sb, owner)} cap.")
    if not args.run:
        print("Dry run. Add --run to make the calls.")
        return

    llm = LiteLlm(model=f"openrouter/{MODEL}")

    def ask(memory, thread, text, label):
        guard = ModelGuard(sb, owner, purpose="memory_demo", model=MODEL)
        writers = Writers(save_fact=lambda fact: add_fact(memory, owner, fact, "chat"))
        result = asyncio.run(run_turn(memory, owner, thread, text, llm=llm, guard=guard, readers=READERS, writers=writers))
        print(f"  [{label}] You: {text}\n  [{label}] Coach: {result.reply.strip()}")
        print(f"  [{label}] tools used: {result.tools_used or 'none'} | model input tokens: {guard.input_tokens} | cost ${sum(guard.input_tokens) and guard.last_cost:.6f}\n")

    print("\nA. NO MEMORY: every message starts a brand new conversation, and nothing is remembered.")
    for text in ["I prefer to run in the morning.", "When do I prefer to run?"]:
        m = FakeStore()
        ask(m, create_thread(m, owner), text, "A")

    print("B. SHORT TERM MEMORY: the same two messages in ONE conversation.")
    m = FakeStore()
    t = create_thread(m, owner)
    for text in ["I prefer to run in the morning.", "When do I prefer to run?"]:
        ask(m, t, text, "B")

    print("C. LONG TERM MEMORY: asked to remember in one conversation, then a brand new conversation.")
    m = FakeStore()
    ask(m, create_thread(m, owner), "Please remember that my favourite route is the canal loop.", "C1")
    print("  facts now saved:", [f["fact"] for f in list_facts(m, owner)], "\n")
    ask(m, create_thread(m, owner), "What is my favourite route?", "C2")

    print("D. THE GATE: no one asked it to remember, but the message sounds like a fact.")
    m = FakeStore()
    ask(m, create_thread(m, owner), "My left calf was a bit tight after yesterday's run.", "D")
    print("  facts saved without being asked:", [f["fact"] for f in list_facts(m, owner)] or "none")
    print(f"Spent this month now ${month_spend(sb, owner):.6f}.")


if __name__ == "__main__":
    main()
