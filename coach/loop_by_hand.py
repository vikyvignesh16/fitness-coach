"""The agent loop written out by hand, so there is no magic. ADK does this for us, plus memory, hooks and tracing.

The model is a function that gets the conversation so far and returns either
  {"tool": "name", "args": {...}}   (please run this tool for me)
  {"answer": "text"}                (I am done)
Our code runs the tools. The model only ever asks.
"""
from typing import Callable

MAX_ROUNDS = 5  # a loop with no limit is a loop that can run up a bill


def run_loop(model: Callable[[list[dict]], dict], tools: dict[str, Callable], question: str, max_rounds: int = MAX_ROUNDS) -> tuple[str, list[dict]]:
    messages = [{"role": "user", "text": question}]
    for _ in range(max_rounds):
        step = model(messages)
        if "answer" in step:
            return step["answer"], messages
        name, args = step.get("tool"), step.get("args", {})
        messages.append({"role": "model", "asks_for": name, "args": args})
        if name not in tools:  # the model can ask for a tool that does not exist. We refuse and say so.
            result = {"error": f"There is no tool called {name!r}. Available: {sorted(tools)}."}
        else:
            try:
                result = tools[name](**args)
            except TypeError as err:  # wrong or missing inputs
                result = {"error": f"Bad inputs for {name}: {err}"}
        messages.append({"role": "tool", "name": name, "result": result})
    return "Stopped: too many rounds without an answer.", messages
