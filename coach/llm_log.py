"""Reads and writes the model call log (llm_calls) and the cap setting (coach_settings).

Only counts and costs are stored. Never the question, the answer or a key.
"""
from datetime import datetime, timezone
from decimal import Decimal

from coach.budget import DEFAULT_CAP_USD, month_start

SHORT_ERROR = 80  # the database column allows 80 characters


def cap_for(sb, user_id: str) -> Decimal:
    """This user's monthly cap in dollars. A missing row means the default."""
    rows = sb.table("coach_settings").select("monthly_cap_usd").eq("user_id", user_id).execute().data
    return Decimal(str(rows[0]["monthly_cap_usd"])) if rows else DEFAULT_CAP_USD


def month_spend(sb, user_id: str, now: datetime | None = None) -> Decimal:
    """What this user has spent since the start of the month (Paris time)."""
    since = month_start(now or datetime.now(timezone.utc)).isoformat()
    rows = sb.table("llm_calls").select("cost_usd").eq("user_id", user_id).gte("at", since).execute().data
    return sum((Decimal(str(r["cost_usd"])) for r in rows), Decimal("0"))


def record_call(sb, user_id: str, *, purpose: str, model: str, input_tokens: int | None, output_tokens: int | None,
                cost: Decimal, ok: bool, error: str | None = None) -> None:
    """Log one call. The error is a short name like cap_reached, cut to fit."""
    sb.table("llm_calls").insert({
        "user_id": user_id, "purpose": purpose, "model": model,
        "input_tokens": input_tokens, "output_tokens": output_tokens,
        "cost_usd": str(cost), "ok": ok, "error": error[:SHORT_ERROR] if error else None,
    }).execute()
