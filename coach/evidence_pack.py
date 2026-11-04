"""Build the text Vicky pastes into ChatGPT to ask for a revised plan.

ChatGPT decides all training. This file only gathers facts (her runs, her races, the current plan,
the hard safety limits) and says exactly how the answer must be written, so code can check it.
Nothing here talks to a model. Only numbers and plan text go in: no tokens, no raw COROS text,
no photos, no weight.

Run: uv run --python 3.12 python -m coach.evidence_pack
"""
import argparse
import json
import os
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from coach.safety import plan_rules as rules
from ingest.home_zone import HOME_ZONE

FACTS_FILE = Path(__file__).resolve().parent.parent / "data" / "athlete_facts.json"
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "exports" / "plan_request.md"
RIEGEL_EXPONENT = 1.06
MARATHON_KM = 42.195
NO_RUN_TYPES = {"no_run", "not_recorded", "actual"}
RUN_TYPES = ["recovery", "easy", "easy_strides", "long_run", "quality", "10k_test", "half_marathon_test", "marathon_race"]


# ---- small formatting helpers

def clock(seconds: float) -> str:
    """3 661 seconds becomes 1:01:01. Under an hour it is m:ss."""
    s = round(seconds)
    h, rest = divmod(s, 3600)
    m, sec = divmod(rest, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


def pace(seconds_per_km: float) -> str:
    s = round(seconds_per_km)
    return f"{s // 60}:{s % 60:02d}"


def riegel(time_s: float, distance_km: float, target_km: float = MARATHON_KM) -> float:
    """Riegel's formula: a rough equivalent time at another distance. A formula, not a prediction."""
    return time_s * (target_km / distance_km) ** RIEGEL_EXPONENT


def paris_date(iso: str) -> date:
    return datetime.fromisoformat(iso).astimezone(HOME_ZONE).date()


def monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


# ---- sections

def races_section(runs: list[dict], facts: dict) -> str:
    by_day = defaultdict(list)
    for r in runs:
        by_day[paris_date(r["started_at"])].append(r)
    lines = []
    for race in facts["races"]:
        day = date.fromisoformat(race["date"])
        found = by_day.get(day)
        if not found:
            raise ValueError(f"No run recorded on {race['date']} for the race '{race['event']}'. Sync the runs first.")
        r = max(found, key=lambda x: x["distance_km"])  # the race is the longest run of the day
        km, t = float(r["distance_km"]), float(r["duration_s"])
        lines.append(
            f"* {race['date']}  {race['event']}: {km:.2f} km recorded by GPS in {clock(t)}, {pace(t / km)} per km, "
            f"average heart rate {r['avg_hr'] if r['avg_hr'] is not None else 'n/a'} (wrist). "
            f"Riegel equivalent for a marathon: {clock(riegel(t, km))}."
        )
    return "\n".join(lines)


def history_section(runs: list[dict], facts: dict) -> str:
    race_days = {r["date"]: r["event"] for r in facts["races"]}
    weeks: dict[date, list[dict]] = defaultdict(list)
    for r in runs:
        weeks[monday(paris_date(r["started_at"]))].append(r)
    table = ["week starting | runs | km | longest run km"]
    for wk in sorted(weeks):
        rs = weeks[wk]
        table.append(f"{wk} | {len(rs)} | {sum(float(r['distance_km']) for r in rs):.1f} | {max(float(r['distance_km']) for r in rs):.1f}")
    each = ["date | km | time | pace per km | avg HR (wrist)"]
    for r in sorted(runs, key=lambda r: r["started_at"]):
        d = paris_date(r["started_at"])
        km, t = float(r["distance_km"]), float(r["duration_s"])
        tag = f"  <- RACE: {race_days[d.isoformat()]}" if d.isoformat() in race_days and km >= 9 else ""
        each.append(f"{d} | {km:.2f} | {clock(t)} | {pace(t / km)} | {r['avg_hr'] if r['avg_hr'] is not None else 'n/a'}{tag}")
    return "Weekly totals (Monday to Sunday, Paris time):\n" + "\n".join(table) + "\n\nEvery recorded outdoor run:\n" + "\n".join(each)


def _part(p: dict | None) -> str:
    if not p:
        return "-"
    if p.get("distance_km") is not None:
        size = f"{p['distance_km']:g} km"
    elif p.get("duration_min") is not None:
        size = f"{p['duration_min']:g} min" if isinstance(p["duration_min"], (int, float)) else "open"
    elif p.get("duration_sec") is not None:
        size = f"{p['duration_sec']:g} s"
    else:
        size = "?"
    target = p.get("pace_min_per_km") or p.get("effort") or ""
    return f"{size} @ {target}" if target else size


def run_summary(run: dict) -> str:
    """One line for a planned run: its type and a short version of its steps."""
    bits = []
    for s in run.get("steps") or []:
        kind = s.get("step")
        if kind == "repeats":
            bits.append(f"{s.get('repetitions')} x ({_part(s.get('work'))} / rec {_part(s.get('recovery'))})")
        elif kind == "run":
            bits.append(_part(s))
        else:
            bits.append(f"{'warm up' if kind == 'warm_up' else 'cool down'} {_part(s)}")
    return f"{run['type']} {run['distance_km']:g} km: " + "; ".join(bits)


def plan_section(plan: dict, today: date, on_watch: set[str]) -> str:
    out = []
    for w in plan["weeks"]:
        if w["phase"] == "Actual":
            continue
        out.append(f"Week {w['week']} from {w['start_date']} ({w['phase']}, {w['total_km']:g} km planned)")
        for d in w["days"]:
            run = d.get("run")
            if not run or run["type"] in NO_RUN_TYPES:
                continue
            day = date.fromisoformat(d["date"])
            flag = " [fixed: already past]" if day < today else (" [approved for her watch]" if d["date"] in on_watch else "")
            out.append(f"  {d['date']} {day.strftime('%a')}: {run_summary(run)}{flag}")
    return "\n".join(out)


def limits_section() -> str:
    r = rules
    return "\n".join([
        f"* Weekly distance: more than {r.RAMP_WARN_PCT} percent above the last non recovery week is a warning, more than {r.RAMP_FAIL_PCT} percent is a failure. "
        f"The first plan week is measured against {r.FIRST_WEEK_BASELINE_KM:.2f} km. Race week is exempt.",
        f"* Long run: never more than {r.LONG_RUN_CAP_KM} km. Over {r.LONG_SHARE_WARN_PCT} percent of the week's distance is a warning, over {r.LONG_SHARE_FAIL_PCT} percent is a failure (race week and half marathon week exempt).",
        f"* At least {r.MIN_DAYS_NO_RUNNING} days a week with no running, and at least {r.MIN_DAYS_NO_RUN_NO_HEAVY} day with no running and no heavy lifting.",
        f"* At most {r.MAX_QUALITY_PER_WEEK} quality session a week. A test counts as one. A test week may have the test plus 1 quality run.",
        f"* No heavy leg session within {r.HEAVY_LEG_HOURS} hours before a long run, test or race, or on the day before a quality session. "
        f"Last heavy leg session {r.LAST_HEAVY_LEGS_IF_RECOVERED:%d %b %Y} if she has recovered from the half marathon test on {r.HALF_MARATHON_DATE:%d %b %Y}, otherwise {r.LAST_HEAVY_LEGS_OTHERWISE:%d %b %Y}. None in race week.",
        "* Persistent pain stops the plan. The gates in the plan (ankle_return_w2, persistent_pain_stop, long_run_25k_gate) stay as they are.",
        "* Every pace is a range (two times), never a single value, and every pace is between 2:00 and 24:59 per km (the watch will not take anything else).",
    ])


def reply_format(example_runs: list[dict]) -> str:
    example = {
        "reason": "Plain words: what you changed and why, using her race results. Short.",
        "pace_table": [
            {"session": "easy", "pace_min_per_km": "m:ss-m:ss", "why": "one line"},
        ],
        "changes": [
            {"date": "YYYY-MM-DD", "run": {**example_runs[0], "notes": "optional text"}},
            {"date": "YYYY-MM-DD", "run": {**example_runs[1], "notes": "optional text"}},
        ],
    }
    return (
        "Reply with ONE JSON object and nothing else, shaped like this (the two example runs only show the format, "
        "they are not suggestions):\n\n```json\n" + json.dumps(example, indent=2, ensure_ascii=False) + "\n```\n\n"
        "Rules for the reply:\n"
        "* `changes` lists every date you change and gives the COMPLETE new run for that date. Dates you leave out stay as they are. "
        "Only future dates (not marked fixed) may change. Avoid changing days marked 'approved for her watch' unless it matters, "
        "because COROS cannot delete a workout, so she would have to remove the old one by hand.\n"
        f"* Run `type` is one of: {', '.join(RUN_TYPES)}, no_run. Keep `gym`, nutrition, gates and week totals out of the reply: code recomputes each week's total as the sum of its run distances.\n"
        "* `distance_km` is the total for the run. The steps must add up to it (count timed pieces by their estimated distance). `duration_min` is your estimate.\n"
        "* Step kinds allowed: `warm_up`, `run`, `repeats`, `cool_down`. Each step has a size: `distance_km`, or `duration_min` (a number), or `duration_sec`. "
        "Give every step a size. Do not use open ended steps.\n"
        "* Every step that is run (`run`, `warm_up`, `cool_down`, and the `work` and `recovery` parts of `repeats`) has `pace_min_per_km` as a range like \"4:37-4:44\", "
        "plus an `effort` note if useful. A walking or drills warm up that is not recorded may be `distance_km: 0` with an `effort` note.\n"
        "* `repeats` has `repetitions` (1 to 20), `work`, and `recovery` (or null). A block of marathon pace inside a long run can be written as a `repeats` step with `repetitions` 1 and `recovery` null.\n"
        "* Do not add heart rate targets yet. Do not add a `coros_workout` block: code builds it from your steps.\n"
        "* After your reply she runs it through a checker. If it finds problems she will paste the list back to you. Fix exactly those and reply with the full JSON again."
    )


def request_section(facts: dict, today: date) -> str:
    wants = "\n".join(f"* {w}" for w in facts["requests"])
    return (
        f"Today is {today:%A %d %B %Y}. You are helping revise Vicky's marathon plan (v5.1, 23 weeks, race day Sunday 4 April 2027, Paris Marathon). "
        "She is the athlete and decides what she does. You decide the training content. "
        "Targets: A 3:15:00 (4:37 per km), B 3:20:00 (4:44 per km), C 3:30:00 (4:59 per km). "
        f"{facts['goal']}\n\nWhat she asks for:\n{wants}\n\n"
        "Also: the paces for the test sessions (10K on 30 Dec, half marathon on 7 Mar) should come from her results, and v5.1 says paces after the 10K are provisional. "
        "Tell her in the reason how you decided paces and how they should be updated after the tests. If something she asked for cannot be done within the safety limits, say which limit and why, instead of breaking it."
    )


def build_pack(plan: dict, runs: list[dict], facts: dict, today: date, on_watch: set[str]) -> str:
    examples = []
    for w in plan["weeks"]:
        for d in w["days"]:
            r = d.get("run")
            if r and r["type"] == "easy" and not examples:
                examples.append({k: v for k, v in r.items() if k != "coros_workout"})
    for w in plan["weeks"]:
        for d in w["days"]:
            r = d.get("run")
            if r and r["type"] == "quality" and any(s.get("step") == "repeats" and (s["work"].get("pace_min_per_km")) for s in r["steps"]) and len(examples) == 1:
                examples.append({k: v for k, v in r.items() if k != "coros_workout"})
    sections = [
        ("1. The request", request_section(facts, today)),
        ("2. About Vicky", f"* Injury: {facts['injury']}\n* Trips: {facts['trips']}\n* Heart rate: {facts['heart_rate']}"),
        ("3. Her races this year (all raced)", races_section(runs, facts)
         + "\nThe GPS distance can be a little longer than the official distance, so official times may be a little faster. "
           "Riegel numbers are a rough formula and ignore marathon specific training, so treat them as one input."),
        ("4. Her running this year", history_section(runs, facts)),
        ("5. The current plan (v5.1), runs only", plan_section(plan, today, on_watch)
         + "\nGym sessions, nutrition and gates are not shown and are not part of this change."),
        ("6. Hard safety limits (code checks these)", limits_section()),
        ("7. How to reply", reply_format(examples)),
    ]
    return "\n\n".join(f"## {title}\n\n{body}" for title, body in sections) + "\n"


# ---- reading the database

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    from dotenv import load_dotenv
    from supabase import create_client
    load_dotenv()
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    version = sb.table("plan_versions").select("version, source").order("created_at", desc=True).limit(1).execute().data[0]
    runs = sb.table("runs").select("started_at, distance_km, duration_s, avg_hr").order("started_at").execute().data
    sent = sb.table("approvals").select("subject_date").eq("kind", "watch_workout").execute().data
    facts = json.loads(FACTS_FILE.read_text())
    today = datetime.now(timezone.utc).astimezone(HOME_ZONE).date()

    pack = build_pack(version["source"], runs, facts, today, {r["subject_date"] for r in sent})
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(pack)
    print(f"Wrote {args.out} ({len(pack) // 1024} KB, plan v{version['version']}, {len(runs)} runs).")


if __name__ == "__main__":
    main()
