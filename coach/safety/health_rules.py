"""Pain and ankle gate rules. persistent_pain_stop is used as written in plan v5.1.

This is not medical advice. A stop always says to get assessed by a professional.
"""
from dataclasses import dataclass, field

from coach.safety.violations import Violation

PAIN_STOP_SCORE = 3
PAIN_LASTING_HOURS = 24  # the plan says "24 to 48 hours". The cautious end is used, so it stops earlier.
SERIOUS_FLAGS = {"swelling", "giving_way", "gait_change", "cannot_bear_weight"}

ANKLE_CHECKS = ("no_swelling_or_limp", "calf_raises_20", "balance_30s", "easy_run_30min")
ASSESS = "Stop planned progression and quality and long runs, and see a sports physio or clinician before resuming."


@dataclass
class PainReport:
    score: int = 0                       # 0 to 10
    repeated: bool = False               # pain at 3 or more on more than one run or morning
    lasted_hours: float = 0              # how long pain at 3 or more lasted
    worse_next_morning: bool = False     # first steps worse the next morning
    flags: set[str] = field(default_factory=set)


def check_pain(report: PainReport) -> list[Violation]:
    reasons = []
    if report.score >= PAIN_STOP_SCORE and report.repeated:
        reasons.append("pain of 3 out of 10 or more, repeatedly")
    if report.score >= PAIN_STOP_SCORE and report.lasted_hours > PAIN_LASTING_HOURS:
        reasons.append(f"pain of 3 or more lasting over {PAIN_LASTING_HOURS} hours")
    if report.worse_next_morning:
        reasons.append("worse first steps the next morning")
    unknown = report.flags - SERIOUS_FLAGS
    if unknown:
        raise ValueError(f"Unknown pain flags: {sorted(unknown)}")
    reasons += [f.replace("_", " ") for f in sorted(report.flags)]
    if not reasons:
        return []
    message = f"Stop: {', '.join(reasons)}. {ASSESS}"
    if "cannot_bear_weight" in report.flags:
        message += " Not being able to bear weight needs prompt medical assessment."
    return [Violation("pain_stop", "fail", message)]


@dataclass
class GateResult:
    passed: bool
    failed_checks: list[str]
    message: str


def evaluate_ankle_gate(results: dict[str, bool]) -> GateResult:
    """All four checks must be answered, and all must pass."""
    missing = [c for c in ANKLE_CHECKS if c not in results]
    if missing:
        raise ValueError(f"Missing ankle gate checks: {missing}")
    failed = [c for c in ANKLE_CHECKS if not results[c]]
    if failed:
        return GateResult(False, failed, "Do not run. Stop impact running and see a sports physio or doctor "
                                         "about swelling, instability or lasting symptoms.")
    return GateResult(True, [], "All four checks passed. Week 2 is unlocked.")


def locked_weeks(ankle_gate_passed: bool) -> set[int]:
    """Week 2 stays locked until the ankle gate record says passed."""
    return set() if ankle_gate_passed else {2}
