"""Lesson 3: the model uses a tool, and we print every step (event) so the loop is visible.

Does nothing without --run, because a real call costs a (tiny) amount of money.
  uv run --python 3.12 python -m coach.first_tool --run                 # invented numbers, nothing personal leaves your computer
  uv run --python 3.12 python -m coach.first_tool --run --real-data     # your real watch numbers go to OpenRouter and OpenAI
"""
import argparse
import asyncio
import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from coach.first_call import APP, MODEL
from coach.guard import ModelGuard
from coach.llm_log import cap_for, month_spend
from coach.tools import health_fetcher, make_health_tool, today_paris
from ingest.import_plan import find_owner

INSTRUCTIONS = (
    "You are a calm running coach for one runner, Vicky. Use the tool to look at her watch numbers before you answer "
    "any question about sleep, recovery or how her body is coping. Never guess a number the tool did not give you. "
    "Answer in three short sentences at most. Use ranges for anything you estimate. This is not medical advice."
)


def invented_fetch(first: str, last: str) -> list[dict]:
    """Made up rows, so the demo needs no personal data."""
    out, day, n = [], datetime.fromisoformat(first), 0
    while day.date().isoformat() <= last:
        n += 1
        out.append({"day": day.date().isoformat(), "sleep_score": 62 + n, "sleep_asleep_min": 360 + 10 * n, "hrv_avg_ms": 50 + n,
                    "hrv_label": "Normal", "hrv_normal_low_ms": 52, "hrv_normal_high_ms": 66, "resting_hr": 55,
                    "stress_avg": 30, "load_ratio": 1.1, "load_label": "Optimal", "recovery_last": 70})
        day += timedelta(days=1)
    return out[1:]  # leave the first day out so the "days without data" count is visible


def describe(event) -> str | None:
    """One line for each kind of step the loop takes."""
    for call in event.get_function_calls():
        return f"MODEL ASKS for tool {call.name} with inputs {dict(call.args)}"
    for resp in event.get_function_responses():
        body = resp.response or {}
        size = f"{len(body.get('days', []))} days" if "days" in body else str(body)[:100]
        return f"OUR CODE RAN {resp.name} and handed back: {size}"
    if event.is_final_response() and event.content and event.content.parts:
        return "FINAL ANSWER: " + "".join(p.text or "" for p in event.content.parts if not p.thought)
    return None


async def run(agent: LlmAgent, question: str) -> None:
    sessions = InMemorySessionService()
    await sessions.create_session(app_name=APP, user_id="vicky", session_id="s1")
    runner = Runner(app_name=APP, agent=agent, session_service=sessions)
    msg = types.Content(role="user", parts=[types.Part(text=question)])
    step = 0
    async for event in runner.run_async(user_id="vicky", session_id="s1", new_message=msg):
        if (line := describe(event)):
            step += 1
            print(f"  step {step}. {line}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--real-data", action="store_true", help="send your real watch numbers to the model")
    parser.add_argument("--question", default="How did I sleep over the last week, and is anything worth watching?")
    args = parser.parse_args()

    load_dotenv()
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    owner = find_owner(sb)
    print(f"Model {MODEL}. Spent this month ${month_spend(sb, owner):.6f} of a ${cap_for(sb, owner)} cap. Data: {'REAL' if args.real_data else 'invented'}.")
    if not args.run:
        print("Dry run. Add --run to make the call.")
        return
    fetch = health_fetcher(sb, owner) if args.real_data else invented_fetch
    guard = ModelGuard(sb, owner, purpose="first_tool", model=MODEL)
    agent = LlmAgent(name="coach", model=LiteLlm(model=f"openrouter/{MODEL}"), instruction=INSTRUCTIONS,
                     tools=[make_health_tool(fetch)],
                     before_model_callback=guard.before_model, after_model_callback=guard.after_model)
    print(f"Question: {args.question}")
    asyncio.run(run(agent, args.question))
    spent = month_spend(sb, owner)
    print(f"Spent this month now ${spent:.6f}.")


if __name__ == "__main__":
    main()
