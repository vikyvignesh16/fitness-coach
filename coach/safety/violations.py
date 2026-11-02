from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class Violation:
    """One broken limit. Warnings are shown to Vicky. Fails go back to the model for a revision."""
    rule: str
    level: Literal["warning", "fail"]
    message: str
    week: int | None = None
    date: str | None = None
