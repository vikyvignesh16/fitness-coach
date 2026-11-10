"""The gate around every model call: check the spending cap before, log the cost after.

ADK calls these two functions for us (they are "callbacks"). The model never sees them and cannot skip them.
"""
from decimal import Decimal

from google.adk.models.llm_response import LlmResponse
from google.genai import types

from coach.budget import check_cap, cost_usd
from coach.llm_log import cap_for, month_spend, record_call


class ModelGuard:
    def __init__(self, sb, user_id: str, *, purpose: str, model: str, cap_override: Decimal | None = None):
        self.sb, self.user_id, self.purpose, self.model = sb, user_id, purpose, model
        self.cap_override = cap_override  # for a demo only, never saved
        self.blocked = False
        self.last_cost = Decimal("0")

    def before_model(self, callback_context, llm_request):
        """Runs before each model call. Returning a response here means the model is not called at all."""
        cap = self.cap_override if self.cap_override is not None else cap_for(self.sb, self.user_id)
        decision = check_cap(month_spend(self.sb, self.user_id), cap)
        if decision.allowed:
            return None
        self.blocked = True
        record_call(self.sb, self.user_id, purpose=self.purpose, model=self.model, input_tokens=None, output_tokens=None,
                    cost=Decimal("0"), ok=False, error="cap_reached")
        return LlmResponse(content=types.Content(role="model", parts=[types.Part(text=decision.reason)]))

    def after_model(self, callback_context, llm_response):
        """Runs after each model call. Works out the cost from the token counts and logs it."""
        usage = llm_response.usage_metadata
        if usage is None:  # an error reply or a partial chunk
            return None
        tokens_in, tokens_out = usage.prompt_token_count or 0, usage.candidates_token_count or 0
        self.last_cost = cost_usd(self.model, tokens_in, tokens_out)
        record_call(self.sb, self.user_id, purpose=self.purpose, model=self.model, input_tokens=tokens_in,
                    output_tokens=tokens_out, cost=self.last_cost, ok=not llm_response.error_code,
                    error=str(llm_response.error_code) if llm_response.error_code else None)
        return None
