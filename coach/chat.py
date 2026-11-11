"""One turn of the coach chat: load memory, build the prompt, run the agent, save what was said.

  1. load the remembered facts          (long term memory)
  2. load the last 20 messages          (short term memory)
  3. build the instruction and a fresh ADK session seeded with that history
  4. run the agent (it may call tools, including save_memory)
  5. save the new user message and the coach's reply
The model remembers nothing between turns. Steps 1 to 3 rebuild everything it knows, every time.

ADK sessions: we still use one, because ADK's Runner needs it. But it lives only for this turn, in memory, and is filled
from OUR tables. Our tables stay the single place where conversations and memories are kept.
"""
import re
from dataclasses import dataclass, field
from datetime import datetime

from google.adk.agents import LlmAgent
from google.adk.events import Event
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from coach.guard import ModelGuard
from coach.instructions import build_instructions
from coach.memory import list_facts, load_history, save_message
from coach.registry import Readers, Writers, build_tools

AGENT_NAME = "coach"
APP = "athlete_coach"

# The gate for save_memory. Blunt on purpose: it is enforced by code, not by asking the model nicely.
REMEMBER_WORDS = re.compile(r"\b(remember|keep in mind|note that|don'?t forget|do not forget|save (this|that|it))\b", re.IGNORECASE)


def asked_to_remember(text: str) -> bool:
    return bool(REMEMBER_WORDS.search(text or ""))


class RememberGate:
    """Runs before every tool call (ADK's before_tool_callback). Returning a dict means the tool is not run."""

    def __init__(self, latest_user_text: str):
        self.allowed = asked_to_remember(latest_user_text)
        self.refused = 0

    def before_tool(self, tool, args, tool_context):
        if tool.name == "save_memory" and not self.allowed:
            self.refused += 1
            return {"error": "save_memory is only allowed when Vicky asks you to remember something. Do not call it again this turn."}
        return None


def history_events(history: list[dict]) -> list[Event]:
    """Turn our saved messages into ADK events, so the model sees the earlier conversation."""
    return [
        Event(author="user" if m["role"] == "user" else AGENT_NAME,
              content=types.Content(role="user" if m["role"] == "user" else "model", parts=[types.Part(text=m["body"])]))
        for m in history
    ]


@dataclass
class TurnResult:
    reply: str
    blocked: bool = False  # the spending cap stopped the call
    tools_used: list[str] = field(default_factory=list)
    saves_refused: int = 0


async def run_turn(memory_db, owner: str, thread_id: str, text: str, *, llm, guard: ModelGuard, readers: Readers,
                   writers: Writers, now: datetime | None = None) -> TurnResult:
    """memory_db is where chat history and facts live. llm is the model (LiteLlm in real use, a scripted fake in tests)."""
    facts = list_facts(memory_db, owner)
    history = load_history(memory_db, owner, thread_id)
    gate = RememberGate(text)

    agent = LlmAgent(
        name=AGENT_NAME, model=llm,
        instruction=lambda ctx: build_instructions(facts),  # a function, so ADK does not treat {braces} in facts as placeholders
        tools=[spec.fn for spec in build_tools(readers, writers, now)],
        before_model_callback=guard.before_model, after_model_callback=guard.after_model,
        before_tool_callback=gate.before_tool,
    )
    sessions = InMemorySessionService()
    session = await sessions.create_session(app_name=APP, user_id=owner, session_id=thread_id)
    for event in history_events(history):
        await sessions.append_event(session, event)

    runner = Runner(app_name=APP, agent=agent, session_service=sessions)
    reply, tools_used = "", []
    message = types.Content(role="user", parts=[types.Part(text=text)])
    async for event in runner.run_async(user_id=owner, session_id=thread_id, new_message=message):
        tools_used += [c.name for c in event.get_function_calls()]
        if event.is_final_response() and event.content and event.content.parts:
            reply = "".join(p.text or "" for p in event.content.parts if not p.thought)

    if not guard.blocked and reply:  # a blocked turn leaves no trace, so trying again later does not duplicate it
        save_message(memory_db, owner, thread_id, "user", text)
        save_message(memory_db, owner, thread_id, "coach", reply)
    return TurnResult(reply=reply, blocked=guard.blocked, tools_used=tools_used, saves_refused=gate.refused)
