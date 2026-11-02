import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from ingest.watch_sync import send_pending

PLAN = json.loads((Path(__file__).resolve().parents[2] / "data" / "paris_marathon_2027_v5_1_coros_ready.json").read_text())
RUNS = {d["date"]: d["run"] for w in PLAN["weeks"] for d in w["days"]}
NOW = datetime(2026, 11, 3, 12, 0, tzinfo=timezone.utc)


class FakeDb:
    def __init__(self, approvals, runs=None, claim_wins=True):
        self.rows = {a["id"]: {"sent_at": None, "send_error": None, "send_started_at": None, "coros_ref": None, **a} for a in approvals}
        self.runs = RUNS if runs is None else runs
        self.claim_wins = claim_wins

    def pending(self):
        return [r for r in self.rows.values() if not r["sent_at"] and not r["send_error"] and not r["send_started_at"]]

    def stale(self, older_than):
        return [r for r in self.rows.values() if r["send_started_at"] and r["send_started_at"] < older_than
                and not r["sent_at"] and not r["send_error"]]

    def plan_run(self, plan_version_id, day):
        return self.runs.get(day)

    def claim(self, approval_id, now):
        if not self.claim_wins or self.rows[approval_id]["send_started_at"]:
            return False
        self.rows[approval_id]["send_started_at"] = now
        return True

    def mark_sent(self, approval_id, now, ref):
        self.rows[approval_id].update(sent_at=now, coros_ref=ref, send_error=None)

    def mark_failed(self, approval_id, error):
        self.rows[approval_id]["send_error"] = error


class FakeCoros:
    def __init__(self, calendar="No training schedule found.", result=(False, '{"idInPlan": 123456}'), raises=None):
        self.calendar, self.result, self.raises = calendar, result, raises
        self.created = []
        self.calendar_calls = 0

    async def schedule_text(self, day):
        self.calendar_calls += 1
        return self.calendar

    async def create_scheduled(self, day, course):
        if self.raises:
            raise self.raises
        self.created.append((day, course))
        return self.result


def approval(i, day="2026-11-04"):
    return {"id": f"a{i}", "subject_date": day, "plan_version_id": "v1"}


def run(db, coros, now=NOW):
    return asyncio.run(send_pending(db, coros, now))


def test_sends_an_approved_run_and_records_it():
    db, coros = FakeDb([approval(1)]), FakeCoros()
    counts = run(db, coros)
    assert counts["sent"] == 1
    assert coros.created[0][0] == "20261104"
    assert coros.created[0][1]["courseName"].startswith("2026-11-04")
    row = db.rows["a1"]
    assert row["sent_at"] == NOW and row["coros_ref"] == "123456" and row["send_error"] is None


def test_a_second_run_sends_nothing_more():
    db, coros = FakeDb([approval(1)]), FakeCoros()
    run(db, coros)
    run(db, coros)
    assert len(coros.created) == 1


def test_a_workout_already_on_the_calendar_is_not_sent_again():
    name = "2026-11-04 | Easy Strides | 7 km"
    db, coros = FakeDb([approval(1)]), FakeCoros(calendar=f"Wed 4 Nov: {name} (planned)")
    counts = run(db, coros)
    assert coros.created == []
    assert counts["already_there"] == 1
    assert db.rows["a1"]["sent_at"] == NOW and "already" in db.rows["a1"]["coros_ref"]


def test_another_workout_that_day_does_not_block_ours():
    db, coros = FakeDb([approval(1)]), FakeCoros(calendar="Wed 4 Nov: Strength session")
    assert run(db, coros)["sent"] == 1


def test_if_another_run_claimed_it_first_we_do_not_send():
    db, coros = FakeDb([approval(1)], claim_wins=False), FakeCoros()
    counts = run(db, coros)
    assert counts["skipped"] == 1 and coros.created == [] and coros.calendar_calls == 0


def test_a_failed_send_is_recorded_and_never_retried_by_itself():
    db, coros = FakeDb([approval(1)]), FakeCoros(result=(True, "Invalid pace range"))
    assert run(db, coros)["failed"] == 1
    assert "Invalid pace range" in db.rows["a1"]["send_error"]
    run(db, coros)
    assert len(coros.created) == 1  # not tried again


def test_an_answer_with_no_workout_id_is_not_trusted():
    db, coros = FakeDb([approval(1)]), FakeCoros(result=(False, "Something happened"))
    assert run(db, coros)["failed"] == 1
    assert db.rows["a1"]["sent_at"] is None and "did not confirm" in db.rows["a1"]["send_error"]


def test_a_crash_is_recorded_with_only_the_error_type():
    db, coros = FakeDb([approval(1)]), FakeCoros(raises=RuntimeError("token=SECRET-VALUE-123"))
    assert run(db, coros)["failed"] == 1
    error = db.rows["a1"]["send_error"]
    assert "RuntimeError" in error and "SECRET-VALUE-123" not in error


def test_one_failure_does_not_stop_the_next_day():
    runs = dict(RUNS)
    runs["2026-11-04"] = None  # nothing planned for that day
    db, coros = FakeDb([approval(1, "2026-11-04"), approval(2, "2026-11-06")], runs=runs), FakeCoros()
    counts = run(db, coros)
    assert counts["failed"] == 1 and counts["sent"] == 1


def test_a_day_that_has_passed_is_refused():
    db, coros = FakeDb([approval(1, "2026-11-02")]), FakeCoros()
    assert run(db, coros)["failed"] == 1 and coros.created == []


def test_a_day_more_than_90_days_ahead_is_refused():
    db, coros = FakeDb([approval(1, "2027-02-02")]), FakeCoros()
    assert run(db, coros)["failed"] == 1 and coros.created == []


def test_the_90th_day_is_allowed():
    db, coros = FakeDb([approval(1, "2027-02-01")]), FakeCoros()
    assert run(db, coros)["sent"] == 1


def test_london_date_decides_today_in_summer():
    # 23:30 UTC on 1 July is already 2 July in London
    late = datetime(2027, 7, 1, 23, 30, tzinfo=timezone.utc)
    db, coros = FakeDb([approval(1, "2027-07-01")]), FakeCoros()
    assert run(db, coros, now=late)["failed"] == 1  # 1 July has passed in London


def test_a_send_that_stopped_part_way_is_flagged_not_resent():
    started = datetime(2026, 11, 3, 11, 0, tzinfo=timezone.utc)  # an hour ago
    db = FakeDb([{**approval(1), "send_started_at": started}])
    coros = FakeCoros()
    counts = run(db, coros)
    assert counts["flagged"] == 1 and coros.created == []
    assert "Check the COROS app" in db.rows["a1"]["send_error"]


def test_a_recently_started_send_is_left_alone():
    started = datetime(2026, 11, 3, 11, 55, tzinfo=timezone.utc)  # five minutes ago
    db = FakeDb([{**approval(1), "send_started_at": started}])
    counts = run(db, FakeCoros())
    assert counts["flagged"] == 0 and db.rows["a1"]["send_error"] is None


def test_nothing_approved_means_nothing_happens():
    coros = FakeCoros()
    assert run(FakeDb([]), coros) == {"sent": 0, "already_there": 0, "failed": 0, "skipped": 0, "flagged": 0}
    assert coros.calendar_calls == 0


def test_counts_are_all_the_job_reports():
    db, coros = FakeDb([approval(1)]), FakeCoros()
    counts = run(db, coros)
    assert set(counts) == {"sent", "already_there", "failed", "skipped", "flagged"}


def test_a_rest_day_that_slipped_through_is_refused_not_sent():
    # 5 November is a rest day in plan v5.1. The web app refuses it, and so does this job.
    db, coros = FakeDb([approval(1, "2026-11-05")]), FakeCoros()
    assert run(db, coros)["failed"] == 1 and coros.created == []
    assert "Could not turn the run" in db.rows["a1"]["send_error"]
