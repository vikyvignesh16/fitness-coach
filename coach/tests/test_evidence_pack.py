import json
from datetime import date
from pathlib import Path

import pytest

from coach.evidence_pack import build_pack, clock, pace, races_section, riegel
from coach.safety import plan_rules as rules

PLAN = json.loads((Path(__file__).resolve().parents[2] / "data" / "paris_marathon_2027_v5_1_coros_ready.json").read_text())
FACTS = json.loads((Path(__file__).resolve().parents[2] / "data" / "athlete_facts.json").read_text())
TODAY = date(2026, 11, 5)


def run(day: str, km: float, seconds: int, hr: int | None = 160, hour: int = 8) -> dict:
    return {"started_at": f"{day}T{hour:02d}:00:00+00:00", "distance_km": km, "duration_s": seconds, "avg_hr": hr}


RUNS = [
    run("2026-03-08", 21.18, 5833, 168),
    run("2026-03-08", 5.0, 1700, 150),  # a warm up the same day: the longer run is the race
    run("2026-04-05", 10.00, 2587, 152),
    run("2026-05-10", 10.05, 2638, 160),
    run("2026-06-07", 10.09, 2576, 164),
    run("2026-10-12", 6.02, 2160, 167),
]


def pack(**over):
    args = dict(plan=PLAN, runs=RUNS, facts=FACTS, today=TODAY, on_watch={"2026-11-08"})
    args.update(over)
    return build_pack(args["plan"], args["runs"], args["facts"], args["today"], args["on_watch"])


def test_formats_and_formula():
    assert clock(2576) == "42:56"
    assert clock(5833) == "1:37:13"
    assert pace(2576 / 10.09) == "4:15"
    assert riegel(2576, 10.09) == pytest.approx(2576 * (42.195 / 10.09) ** 1.06)
    assert 11500 < riegel(2576, 10.09) < 12500  # about 3:15 to 3:25 in seconds


def test_races_use_the_longest_run_of_the_day():
    text = races_section(RUNS, FACTS)
    assert "21.18 km" in text and "1:37:13" in text and "4:35 per km" in text
    assert "5.00 km" not in text
    assert "10.09 km" in text and "42:56" in text and "4:15 per km" in text


def test_a_race_with_no_run_that_day_stops_the_pack():
    with pytest.raises(ValueError, match="2026-06-07"):
        pack(runs=[r for r in RUNS if not r["started_at"].startswith("2026-06-07")])


def test_states_the_goal_the_requests_and_the_facts_she_gave():
    p = pack()
    for needle in ["3:15:00", "4:37", "4:44", "marathon pace blocks", "pace range on every running step", "No running from 2026-08-24", "chest strap"]:
        assert needle.lower() in p.lower(), needle


def test_safety_limits_come_from_the_code_constants():
    p = pack()
    assert f"never more than {rules.LONG_RUN_CAP_KM} km" in p
    assert f"{rules.HEAVY_LEG_HOURS} hours" in p
    assert f"{rules.LAST_HEAVY_LEGS_IF_RECOVERED:%d %b %Y}" in p
    assert f"{rules.FIRST_WEEK_BASELINE_KM:.2f}" in p


def test_marks_past_days_fixed_and_approved_days():
    p = pack()
    line = next(l for l in p.splitlines() if l.strip().startswith("2026-11-02"))
    assert "[fixed: already past]" in line
    sunday = next(l for l in p.splitlines() if l.strip().startswith("2026-11-08"))
    assert "[approved for her watch]" in sunday
    later = next(l for l in p.splitlines() if l.strip().startswith("2026-11-22"))
    assert "[" not in later


def test_lists_every_planned_run_from_the_plan():
    p = pack()
    dates = [d["date"] for w in PLAN["weeks"] if w["phase"] != "Actual" for d in w["days"]
             if d.get("run") and d["run"]["type"] not in {"no_run", "not_recorded", "actual"}]
    assert len(dates) == 101
    for d in dates:
        assert f"  {d} " in p, d


def test_the_pack_holds_no_secrets_raw_text_or_weight():
    p = pack().lower()
    for bad in ["token", "service_role", "supabase", "openrouter", "labelid", "startcoordinates", "77.5", "photo", "password"]:
        assert bad not in p, bad


def test_the_example_reply_in_the_pack_is_valid_json_with_the_agreed_shape():
    p = pack()
    block = p.split("```json\n")[1].split("\n```")[0]
    reply = json.loads(block)
    assert set(reply) == {"reason", "pace_table", "changes"}
    assert reply["pace_table"][0]["pace_min_per_km"] == "m:ss-m:ss"  # a placeholder, not a suggested pace
    assert all(c["run"]["notes"] == "optional text" for c in reply["changes"])
    assert len(reply["changes"]) == 2
    for c in reply["changes"]:
        assert "coros_workout" not in c["run"]
        assert {s["step"] for s in c["run"]["steps"]} <= {"warm_up", "run", "repeats", "cool_down"}


def test_the_example_runs_can_become_watch_workouts():
    # The format we ask for must be something the watch code can already convert.
    from ingest.watch_course import to_course
    block = pack().split("```json\n")[1].split("\n```")[0]
    for c in json.loads(block)["changes"]:
        run = dict(c["run"])
        run["coros_workout"] = {"steps": run["steps"], "name": "example"}
        assert to_course(run)["sections"]
