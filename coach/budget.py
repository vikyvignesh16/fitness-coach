"""Model prices and the monthly spending cap.

The cap is a safety limit, so it is a plain tested function and not part of any prompt.
Prices are dollars per million tokens, read from OpenRouter's model list on 10 Nov 2026. Check them again
when a model changes, because a wrong price makes the cap wrong.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

HOME_TIME_ZONE = ZoneInfo("Europe/Paris")
DEFAULT_CAP_USD = Decimal("10")
WARN_AT = Decimal("0.8")  # show a warning from 80 percent of the cap

# (input, output) dollars per million tokens
PRICES: dict[str, tuple[Decimal, Decimal]] = {
    "openai/gpt-6-luna": (Decimal("0.10"), Decimal("0.50")),
    "openai/gpt-6-sol": (Decimal("2"), Decimal("10")),
    "openai/text-embedding-3-small": (Decimal("0.02"), Decimal("0")),  # embeddings have no output tokens
}


def cost_usd(model: str, input_tokens: int, output_tokens: int) -> Decimal:
    """What a call cost. An unknown model raises, because guessing a price would make the cap unreliable."""
    if model not in PRICES:
        raise ValueError(f"No price known for model {model!r}. Add it to coach/budget.py before using it.")
    if input_tokens < 0 or output_tokens < 0:
        raise ValueError("Token counts cannot be negative.")
    price_in, price_out = PRICES[model]
    return (price_in * input_tokens + price_out * output_tokens) / Decimal(1_000_000)


def month_start(now: datetime) -> datetime:
    """The start of the current month in Paris, as a UTC time. The cap resets on the 1st, Paris time."""
    local = now.astimezone(HOME_TIME_ZONE)
    first = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return first.astimezone(timezone.utc)


@dataclass(frozen=True)
class CapDecision:
    allowed: bool
    spent: Decimal
    cap: Decimal
    warn: bool  # at or above 80 percent of the cap

    @property
    def reason(self) -> str:
        return "" if self.allowed else f"Monthly cap of ${self.cap} reached (${self.spent:.4f} spent)."


def check_cap(spent: Decimal, cap: Decimal) -> CapDecision:
    """A call is allowed while this month's spend is under the cap.

    The check happens before a call, so the call that crosses the line can overshoot by its own cost.
    With Luna that is a fraction of a cent. A cap of zero blocks everything.
    """
    if spent < 0 or cap < 0:
        raise ValueError("Spend and cap cannot be negative.")
    return CapDecision(allowed=spent < cap, spent=spent, cap=cap, warn=cap > 0 and spent >= cap * WARN_AT)
