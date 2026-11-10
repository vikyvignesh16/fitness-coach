"""Lesson 2: a fixed form for the model's answer.

A Pydantic class lists the fields and what each may hold. ADK tells the model the shape, and we check the reply
against the same class. A reply that does not fit is rejected with plain messages, never silently fixed.
This is a practice form. The real daily review form comes in lesson 10.
"""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError

Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]

MAX_OBSERVATIONS = 5


class RunnerNote(BaseModel):
    model_config = ConfigDict(extra="forbid")  # a field we did not ask for is an error, not a gift

    headline: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)] = Field(
        description="One short sentence about how the runner looks today.")
    readiness: Literal["green", "amber", "red"] = Field(
        description="green means fine to train as planned, amber means take care, red means rest and watch.")
    observations: list[Short] = Field(
        min_length=1, max_length=MAX_OBSERVATIONS,
        description="One to five short facts taken only from the numbers given.")
    confidence: float = Field(ge=0, le=1, description="How sure you are, from 0 (guessing) to 1 (certain).")


def check_note(text: str) -> tuple[RunnerNote | None, list[str]]:
    """Check the model's reply against the form. Returns the note, or a list of plain problems."""
    try:
        return RunnerNote.model_validate_json(text), []
    except ValidationError as err:
        return None, [f"{'.'.join(str(p) for p in e['loc']) or 'reply'}: {e['msg']}" for e in err.errors()]
