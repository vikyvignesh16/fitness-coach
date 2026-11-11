"""A scripted stand in for the model, so the whole chat turn can be tested for free. It records every request it receives."""
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_response import LlmResponse
from google.genai import types
from pydantic import Field


def say(text: str) -> list[types.Part]:
    return [types.Part(text=text)]


def call(name: str, **args) -> list[types.Part]:
    return [types.Part(function_call=types.FunctionCall(name=name, args=args))]


class ScriptedLlm(BaseLlm):
    model: str = "scripted"
    script: list = Field(default_factory=list)  # one list of parts per model call, in order
    seen: list = Field(default_factory=list)  # every request the "model" received

    async def generate_content_async(self, llm_request, stream=False):
        self.seen.append(llm_request)
        parts = self.script.pop(0)
        yield LlmResponse(content=types.Content(role="model", parts=parts),
                          usage_metadata=types.GenerateContentResponseUsageMetadata(prompt_token_count=100, candidates_token_count=20))

    # helpers for assertions
    def system_text(self, n: int = 0) -> str:
        return str(self.seen[n].config.system_instruction)

    def contents_text(self, n: int = 0) -> list[tuple[str, str]]:
        return [(c.role, "".join(p.text or "" for p in c.parts)) for c in self.seen[n].contents]
