"""Lesson 1: one model call through ADK and OpenRouter, with the spending cap and the cost log.

Does nothing without --run, because a real call costs a (tiny) amount of money.
  uv run --python 3.12 python -m coach.first_call --run
  uv run --python 3.12 python -m coach.first_call --run --cap-override 0.0001   # shows the cap blocking a call
"""
import argparse
import asyncio
import os
from decimal import Decimal

from dotenv import load_dotenv
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from coach.guard import ModelGuard
from coach.llm_log import cap_for, month_spend
from ingest.import_plan import find_owner

MODEL = "openai/gpt-6-luna"
APP = "athlete_coach"
INSTRUCTIONS = (
    "You are a calm running coach for one runner, Vicky, who is training for the Paris Marathon. "
    "Answer in two short sentences, plain words. Use ranges, never one exact number. "
    "You have no access to her data in this lesson, so say so if asked about it."
)


def build_agent(guard: ModelGuard) -> LlmAgent:
    return LlmAgent(
        name="coach", model=LiteLlm(model=f"openrouter/{MODEL}"), instruction=INSTRUCTIONS,
        before_model_callback=guard.before_model, after_model_callback=guard.after_model,
    )


async def ask(agent: LlmAgent, question: str) -> str:
    sessions = InMemorySessionService()
    await sessions.create_session(app_name=APP, user_id="vicky", session_id="s1")
    runner = Runner(app_name=APP, agent=agent, session_service=sessions)
    answer = ""
    async for event in runner.run_async(user_id="vicky", session_id="s1", new_message=types.Content(role="user", parts=[types.Part(text=question)])):
        if event.is_final_response() and event.content and event.content.parts:
            answer = "".join(p.text or "" for p in event.content.parts if not p.thought)  # thought parts are the model's private notes
    return answer


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", action="store_true", help="make the real call")
    parser.add_argument("--cap-override", type=Decimal, help="use this cap for this run only, in dollars. Not saved.")
    parser.add_argument("--question", default="Why is it a good idea to keep most of my running easy?")
    args = parser.parse_args()

    load_dotenv()
    if not os.environ.get("OPENROUTER_API_KEY"):
        raise SystemExit("OPENROUTER_API_KEY is not set in .env.")
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    owner = find_owner(sb)
    cap = args.cap_override if args.cap_override is not None else cap_for(sb, owner)
    print(f"Model {MODEL}. Spent this month ${month_spend(sb, owner):.6f} of a ${cap} cap.")
    if not args.run:
        print("Dry run. Add --run to make the call.")
        return
    guard = ModelGuard(sb, owner, purpose="first_call", model=MODEL, cap_override=args.cap_override)
    print("Answer:", asyncio.run(ask(build_agent(guard), args.question)))
    print("Blocked by the cap." if guard.blocked else f"Cost of this call: ${guard.last_cost:.6f}")
    print(f"Spent this month now ${month_spend(sb, owner):.6f}.")


if __name__ == "__main__":
    main()
