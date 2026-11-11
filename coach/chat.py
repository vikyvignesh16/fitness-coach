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
import inspect
import re
from dataclasses import dataclass, field
from datetime import datetime

from google.adk.agents import LlmAgent
from google.adk.events import Event
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from coach.answer_checks import check_answer, fallback_for, with_pain_notice
from coach.budget import MAX_OUTPUT_TOKENS, MAX_TOOL_CALLS, EXTRA_MODEL_CALLS, worst_case_cost
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


class ToolLimit:
    """Runs before every tool call. After MAX_TOOL_CALLS requests in one turn, every further request is refused.

    This is what stops a model that keeps asking for tools. Every request counts, including ones another gate refuses.
    """

    def __init__(self, maximum: int = MAX_TOOL_CALLS):
        self.maximum, self.requested, self.refused = maximum, 0, 0

    def before_tool(self, tool, args, tool_context):
        self.requested += 1
        if self.requested > self.maximum:
            self.refused += 1
            return {"error": f"Tool call limit reached ({self.maximum} per turn). Answer with what you already have."}
        return None


@dataclass
class TurnResult:
    reply: str
    blocked: bool = False  # the spending cap stopped the call
    tools_used: list[str] = field(default_factory=list)
    saves_refused: int = 0
    tool_calls_refused: int = 0  # requests past the per turn tool limit
    stopped: bool = False  # the model call limit ended the turn
    revised: bool = False  # the first answer failed a check and the model was asked once for a better one
    replaced: bool = False  # the revised answer failed too, so a fixed safe message was used
    problems: list[str] = field(default_factory=list)  # what the checks found in the first answer, kept for the log and demos


REVISION_REQUEST = (
    "Your answer broke these rules:\n{problems}\n"
    "Write a new answer. Use only numbers that a tool returned or that Vicky said. "
    "Give no food, supplement or treatment advice unless you cite a returned reference of kind evidence, like [lib:1a2b3c4d]. "
    "Cite only references a search returned. If you cannot answer within these rules, say so plainly."
)


def _prompt_chars(instruction: str, history: list[dict], text: str, tools) -> int:
    """A rough size of everything sent on one call, for the worst case estimate. Tool descriptions count too."""
    schema = sum(len(inspect.getdoc(spec.fn) or "") + 300 for spec in tools)
    return len(instruction) + sum(len(m["body"]) for m in history) + len(text) + schema


async def run_turn(memory_db, owner: str, thread_id: str, text: str, *, llm, guard: ModelGuard, readers: Readers,
                   writers: Writers, now: datetime | None = None) -> TurnResult:
    """memory_db is where chat history and facts live. llm is the model (LiteLlm in real use, a scripted fake in tests).

    Guards, in order: the worst case cost must fit under the cap; at most MAX_TOOL_CALLS tool requests and a fixed number of
    model calls; the answer is checked (citations, health claims, numbers); one revision if it fails, a fixed safe message if
    it fails again; the pain notice is added whenever the user mentioned pain.
    """
    facts = list_facts(memory_db, owner)
    history = load_history(memory_db, owner, thread_id)
    gate, limit = RememberGate(text), ToolLimit()
    instruction = build_instructions(facts)
    specs = build_tools(readers, writers, now)

    reason = guard.preflight(worst_case_cost(guard.model, _prompt_chars(instruction, history, text, specs)))
    if reason:
        return TurnResult(reply=reason, blocked=True)
    guard.max_model_calls = MAX_TOOL_CALLS + EXTRA_MODEL_CALLS

    def before_tool(tool, args, tool_context):
        return limit.before_tool(tool, args, tool_context) or gate.before_tool(tool, args, tool_context)

    agent = LlmAgent(
        name=AGENT_NAME, model=llm,
        instruction=lambda ctx: instruction,  # a function, so ADK does not treat {braces} in facts as placeholders
        tools=[spec.fn for spec in specs],
        generate_content_config=types.GenerateContentConfig(max_output_tokens=MAX_OUTPUT_TOKENS),
        before_model_callback=guard.before_model, after_model_callback=guard.after_model,
        before_tool_callback=before_tool,
    )
    sessions = InMemorySessionService()
    session = await sessions.create_session(app_name=APP, user_id=owner, session_id=thread_id)
    for event in history_events(history):
        await sessions.append_event(session, event)
    runner = Runner(app_name=APP, agent=agent, session_service=sessions)

    tools_used: list[str] = []
    tool_results: list[dict] = []  # what the tools returned this turn: the only things an answer may rely on
    tool_args: list[dict] = []

    async def ask(message_text: str) -> str:
        reply = ""
        message = types.Content(role="user", parts=[types.Part(text=message_text)])
        async for event in runner.run_async(user_id=owner, session_id=thread_id, new_message=message):
            for call in event.get_function_calls():
                tools_used.append(call.name)
                tool_args.append(dict(call.args or {}))
            tool_results.extend(r.response for r in event.get_function_responses() if isinstance(r.response, dict))
            if event.is_final_response() and event.content and event.content.parts:
                reply = "".join(p.text or "" for p in event.content.parts if not p.thought)
        return reply

    said = [text, *[m["body"] for m in history if m["role"] == "user"], *[f["fact"] for f in facts]]
    reply = await ask(text)
    problems: list[str] = []
    revised = replaced = False
    if reply and not guard.blocked and not guard.stopped:
        problems = check_answer(reply, tool_results, tool_args, said)
        if problems:
            revised = True
            reply = await ask(REVISION_REQUEST.format(problems="\n".join(f"- {p}" for p in problems)))
            if reply and not guard.blocked and not guard.stopped:
                still_wrong = check_answer(reply, tool_results, tool_args, said)
                if still_wrong:
                    reply, replaced = fallback_for(still_wrong), True
    if reply and not guard.blocked and not guard.stopped:
        reply = with_pain_notice(text, reply)
        save_message(memory_db, owner, thread_id, "user", text)  # a blocked or stopped turn leaves no trace, so trying again does not duplicate it
        save_message(memory_db, owner, thread_id, "coach", reply)
    return TurnResult(reply=reply, blocked=guard.blocked, tools_used=tools_used, saves_refused=gate.refused,
                      tool_calls_refused=limit.refused, stopped=guard.stopped, revised=revised, replaced=replaced, problems=problems)
