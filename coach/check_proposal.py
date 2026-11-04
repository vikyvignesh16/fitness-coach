"""Check a plan that ChatGPT sent back. Reads only. Never edits the plan.

    python -m coach.check_proposal path/to/plan.json

Compares it with the plan of record (v5.1), runs the safety rules, and checks that every
run can go to the watch. Prints a list you can paste back to ChatGPT.
"""
import argparse
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

from coach.safety.plan_rules import check_plan
from ingest.home_zone import HOME_ZONE
from ingest.watch_course import CourseError, parse_pace_range, to_course

BASE_PLAN = Path(__file__).resolve().parent.parent / "data" / "paris_marathon_2027_v5_1_coros_ready.json"
IGNORED_FOR_PAST = {"fueling_hydration", "coros_workout"}  # extra detail may be added to past days
STEP_SUM_TOLERANCE_KM = 0.6
WEEK_SUM_TOLERANCE_KM = 0.6
LONG_DESCRIPTION = 400  # v5.1's longest was 359
NOTE_FIELDS = ["before", "during", "after", "next_24_48h", "stop_or_modify", "heart_rate"]
EASY_TYPES = {"easy", "recovery", "long_run", "easy_strides"}
HARD_TYPES = {"half_marathon_test", "10k_test", "marathon_race"}
MP_SLOWEST_S = 4 * 60 + 55  # anything faster than 4:55 per km counts as marathon pace or quicker
PACED_KINDS = {"run", "warm_up", "cool_down"}


def _days(plan: dict):
    for week in plan.get("weeks", []):
        for day in week.get("days", []):
            yield week, day


def _off_record(step: dict) -> bool:
    return step.get("distance_km") == 0 and bool(step.get("effort"))


def _pace_problem(part: dict, label: str) -> str | None:
    text = part.get("pace_min_per_km")
    if not text:
        return f"{label} has no pace range"
    try:
        parse_pace_range(text)
    except CourseError as e:
        return f"{label}: {e}"
    return None


def _step_paces(run: dict, where: str) -> list[str]:
    out = []
    for i, step in enumerate(run.get("steps") or [], 1):
        kind = step.get("step")
        label = f"{where} step {i} ({kind})"
        if kind in PACED_KINDS:
            if _off_record(step):
                continue
            if (p := _pace_problem(step, label)):
                out.append(p)
        elif kind == "repeats":
            if (p := _pace_problem(step.get("work") or {}, f"{label} work")):
                out.append(p)
            if step.get("recovery") and (p := _pace_problem(step["recovery"], f"{label} recovery")):
                out.append(p)
    return out


def _step_km(step: dict) -> float | None:
    """Distance a step covers, or None when it cannot be known (timed or open ended)."""
    if step.get("step") == "repeats":
        reps = step.get("repetitions") or 0
        if step.get("distance_km_estimate") is not None:
            return float(step["distance_km_estimate"])  # the plan gives this as the total for the whole block
        parts = [step.get("work") or {}] + ([step["recovery"]] if step.get("recovery") else [])
        if all(p.get("distance_km") is not None for p in parts):
            return reps * sum(p["distance_km"] for p in parts)
        return None
    return float(step["distance_km"]) if step.get("distance_km") is not None else None


def _has_fast_step(steps: list[dict]) -> bool:
    parts = []
    for s in steps:
        parts += [s.get("work") or {}, s.get("recovery") or {}] if s.get("step") == "repeats" else [s]
    for p in parts:
        try:
            pace = parse_pace_range(p.get("pace_min_per_km"))
        except CourseError:
            continue
        if pace and pace[1] <= MP_SLOWEST_S:
            return True
    return False


def _name_km(name: str | None) -> float | None:
    m = re.search(r"\|\s*([\d.]+)\s*km\s*$", name or "")
    return float(m.group(1)) if m else None


def check_runs(plan: dict) -> tuple[list[str], list[str]]:
    """Per run checks: pace on every step, watch ready, internally consistent."""
    errors, warnings = [], []
    for _, day in _days(plan):
        run, d = day.get("run") or {}, day["date"]
        km = run.get("distance_km") or 0
        if km <= 0 or run.get("type") in ("actual", "not_recorded"):
            continue
        cw = run.get("coros_workout")
        if not cw:
            errors.append(f"{d}: a {km:g} km run has no coros_workout, so it cannot go to the watch.")
            continue
        steps = run.get("steps") or []
        if not steps:
            errors.append(f"{d}: the run has no steps.")
            continue
        errors += _step_paces(run, d)
        if cw.get("steps") != steps:
            errors.append(f"{d}: coros_workout.steps differs from the run's steps. The watch reads coros_workout, so they must match.")
        try:
            to_course(run)
        except (CourseError, KeyError, TypeError, ValueError) as e:
            errors.append(f"{d}: cannot be turned into a watch workout: {e}")
        if cw.get("total_distance_km") != km:
            errors.append(f"{d}: coros_workout.total_distance_km is {cw.get('total_distance_km')} but the run is {km:g} km.")
        if (n := _name_km(cw.get("name"))) is not None and abs(n - km) > 0.05:
            warnings.append(f"{d}: workout name says {n:g} km but the run is {km:g} km.")
        known = [_step_km(s) for s in steps if not _off_record(s)]
        if known and None not in known and abs(sum(known) - km) > STEP_SUM_TOLERANCE_KM:
            warnings.append(f"{d}: steps add up to {sum(known):.1f} km but the run says {km:g} km.")
        mins = run.get("duration_min") or 0
        if not mins:
            warnings.append(f"{d}: no duration_min on a {km:g} km run.")
        elif run.get("type") != "marathon_race" and not 4.0 <= mins / km <= 7.5:
            warnings.append(f"{d}: {km:g} km in {mins} min is {mins / km:.1f} min per km, which looks wrong.")
        if not run.get("pace_or_effort"):
            warnings.append(f"{d}: pace_or_effort is empty on a run.")
        top = (cw.get("rpe_range_0_10") or [0, 0])[1]
        if run.get("type") in EASY_TYPES and top >= 7:
            warnings.append(f"{d}: an easy run carries a hard effort range in coros_workout (RPE up to {top}). Probably left over from an older version.")
        if run.get("type") in HARD_TYPES and top <= 4:
            warnings.append(f"{d}: a {run['type']} carries an easy effort range in coros_workout (RPE up to {top}). Probably left over from an older version.")
        if re.search(r"\bMP\b|marathon pace", run.get("pace_or_effort") or "") and not _has_fast_step(steps):
            warnings.append(f"{d}: the headline mentions marathon pace but no step is run at marathon pace.")
        text = f"{run.get('pace_or_effort', '')} {run.get('notes', '')}"
        if run.get("type") not in ("10k_test",) and "10K test" in text and "replace" not in text.lower():
            warnings.append(f"{d}: still mentions the 10K test, which has been replaced.")
    return errors, warnings


def check_descriptions(plan: dict) -> list[str]:
    """The run notes are copied into the COROS workout description. COROS's limit is not known, so say if any are long."""
    lengths = []
    for _, day in _days(plan):
        run = day.get("run") or {}
        if run.get("coros_workout") and run.get("steps"):
            try:
                lengths.append((len(to_course(run)["courseDescription"]), day["date"]))
            except (CourseError, KeyError, TypeError, ValueError):
                continue  # already reported by check_runs
    long = [(n, d) for n, d in lengths if n > LONG_DESCRIPTION]
    if not long:
        return []
    top = max(long)
    return [f"{len(long)} watch descriptions are longer than {LONG_DESCRIPTION} characters (longest {top[0]} on {top[1]}). "
            "COROS's limit is not known, so check the first one on the watch before sending the rest."]


def check_notes(plan: dict) -> list[str]:
    """Coaching notes on every day, all six fields filled in."""
    out = []
    for _, day in _days(plan):
        notes = day.get("coaching_notes")
        if not isinstance(notes, dict):
            out.append(f"{day['date']}: no coaching_notes.")
            continue
        empty = [f for f in NOTE_FIELDS if not str(notes.get(f, "")).strip()]
        if empty:
            out.append(f"{day['date']}: coaching_notes missing {', '.join(empty)}.")
    return out


def check_totals(plan: dict) -> list[str]:
    out = []
    for week in plan.get("weeks", []):
        total = sum((d.get("run") or {}).get("distance_km") or 0 for d in week.get("days", []))
        if abs(total - week.get("total_km", 0)) > WEEK_SUM_TOLERANCE_KM:
            out.append(f"Week {week['week']}: total_km says {week.get('total_km')} but the days add up to {total:.1f}.")
    return out


def check_against_base(plan: dict, base: dict, today: date) -> tuple[list[str], list[str]]:
    """Same dates as v5.1, and nothing in the past or today changed."""
    errors, warnings = [], []
    new = {d["date"]: d for _, d in _days(plan)}
    old = {d["date"]: d for _, d in _days(base)}
    for gone in sorted(set(old) - set(new)):
        errors.append(f"{gone}: day is missing compared with v5.1.")
    for extra in sorted(set(new) - set(old)):
        errors.append(f"{extra}: day does not exist in v5.1.")
    for d in sorted(set(old) & set(new)):
        if date.fromisoformat(d) >= today:
            continue
        a, b = old[d], new[d]
        for key in set(a) | set(b):
            if key == "coaching_notes":
                continue
            if key == "run":
                ra = {k: v for k, v in a["run"].items() if k not in IGNORED_FOR_PAST}
                rb = {k: v for k, v in b["run"].items() if k not in IGNORED_FOR_PAST}
                if ra != rb:
                    errors.append(f"{d}: this day is in the past but its run changed.")
            elif a.get(key) != b.get(key):
                errors.append(f"{d}: this day is in the past but its {key} changed.")
    if json.dumps(plan.get("gates"), sort_keys=True) != json.dumps(base.get("gates"), sort_keys=True):
        warnings.append("The gates differ from v5.1.")
    if plan.get("plan_version") == base.get("plan_version"):
        errors.append(f"plan_version is still {plan.get('plan_version')}. A new plan needs a new version number.")
    return errors, warnings


def run_checks(plan: dict, base: dict, today: date) -> dict:
    e1, w1 = check_against_base(plan, base, today)
    e2, w2 = check_runs(plan)
    safety = check_plan(plan)
    return {
        "errors": e1 + e2 + [f"{v.date or 'week ' + str(v.week)}: {v.message} [{v.rule}]" for v in safety if v.level == "fail"]
        + check_notes(plan),
        "warnings": w1 + w2 + check_totals(plan) + check_descriptions(plan) + [f"{v.date or 'week ' + str(v.week)}: {v.message} [{v.rule}]" for v in safety if v.level != "fail"],
    }


def report(result: dict, name: str) -> str:
    errs, warns = result["errors"], result["warnings"]
    lines = [f"Check of {name}", ""]
    lines.append("RESULT: " + ("fixes needed" if errs else "no blocking problems") + f" ({len(errs)} to fix, {len(warns)} to look at)")
    if errs:
        lines += ["", "TO FIX:"] + [f"  {i}. {e}" for i, e in enumerate(errs, 1)]
    if warns:
        lines += ["", "TO LOOK AT (not blocking):"] + [f"  {i}. {w}" for i, w in enumerate(warns, 1)]
    if errs or warns:
        lines += ["", "--- paste this to ChatGPT ---",
                  "My checker found these problems in the plan you sent. Please send a corrected full plan JSON. "
                  "Fix every item under TO FIX. Say what you did with each item under TO LOOK AT. "
                  "Do not change days before today, and keep the same dates and plan structure."]
        lines += [f"TO FIX: {e}" for e in errs] + [f"TO LOOK AT: {w}" for w in warns]
        lines += ["--- end ---"]
    return "\n".join(lines)


class SaveRefused(Exception):
    """The draft was not saved. The message says why, in plain words."""


def save_draft(sb, owner: str, plan: dict, result: dict, reason: str) -> str:
    """Store a checked plan as a draft in plan_proposals. It is not a plan version, so nothing in the app changes."""
    if result["errors"]:
        raise SaveRefused("The plan still has problems to fix, so it was not saved.")
    if not reason.strip():
        raise SaveRefused("Say why the plan changed with --reason.")
    version = plan.get("plan_version")
    for table in ("plan_versions", "plan_proposals"):
        found = sb.table(table).select("id").eq("user_id", owner).eq("version", version).execute().data
        if found:
            raise SaveRefused(f"Version {version} already exists in {table}. Plan versions are never overwritten.")
    base = (sb.table("plan_versions").select("id").eq("user_id", owner)
            .order("created_at", desc=True).limit(1).execute().data)
    row = {
        "user_id": owner,
        "version": version,
        "source": plan,
        "reason": reason.strip(),
        "checks": {"errors": result["errors"], "warnings": result["warnings"]},
        "base_version_id": base[0]["id"] if base else None,
    }
    return sb.table("plan_proposals").insert(row).execute().data[0]["id"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("plan", type=Path)
    parser.add_argument("--base", type=Path, default=BASE_PLAN)
    parser.add_argument("--save", action="store_true", help="store the plan as a draft for Vicky to approve in the app")
    parser.add_argument("--reason", default="", help="why the plan changed (required with --save)")
    args = parser.parse_args()
    plan = json.loads(args.plan.read_text())
    base = json.loads(args.base.read_text())
    result = run_checks(plan, base, datetime.now(HOME_ZONE).date())
    print(report(result, args.plan.name))
    if args.save:
        import os
        from dotenv import load_dotenv
        from supabase import create_client
        from ingest.import_plan import find_owner
        load_dotenv()
        sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        try:
            draft_id = save_draft(sb, find_owner(sb), plan, result, args.reason)
        except SaveRefused as e:
            print(f"\nNot saved: {e}")
            return 1
        print(f"\nSaved as draft {draft_id}. Open /plan/proposal in the app to read it and approve.")
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
