from datetime import datetime, timedelta, timezone

from ingest.coros_run_details import pick_runs, row_for_save, run_job, save_details
from ingest.tests.test_run_details import FULL

NOW = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)
iso = lambda d: d.isoformat()


def run(i, days_ago, fetched_hours_ago=None, sport=100):
    return {"coros_id": f"r{i}", "started_at": iso(NOW - timedelta(days=days_ago)),
            "detail_fetched_at": None if fetched_hours_ago is None else iso(NOW - timedelta(hours=fetched_hours_ago)), "sport_type": sport}


def test_runs_never_read_come_first_newest_first():
    picked = pick_runs([run(1, 30), run(2, 2), run(3, 60)], NOW, 10)
    assert [i for i, _ in picked] == ["r2", "r1", "r3"]


def test_a_recent_run_is_read_again_only_after_three_hours():
    runs = [run(1, 1, fetched_hours_ago=1), run(2, 1, fetched_hours_ago=4), run(3, 2, fetched_hours_ago=10)]
    assert [i for i, _ in pick_runs(runs, NOW, 10)] == ["r3", "r2"]  # the longest ago first


def test_an_old_run_that_has_its_details_is_left_alone():
    assert pick_runs([run(1, 30, fetched_hours_ago=1000)], NOW, 10) == []


def test_the_batch_limit_and_the_sport_type_are_kept():
    picked = pick_runs([run(i, i, sport=101) for i in range(1, 6)], NOW, 2)
    assert picked == [("r1", 101), ("r2", 101)]


def test_a_missing_sport_type_means_an_outdoor_run():
    assert pick_runs([run(1, 1, sport=None)], NOW, 1) == [("r1", 100)]


def test_empty_values_are_not_written_but_your_editable_fields_are_cleared():
    row = row_for_save({"training_load": None, "cadence_spm": 150, "perceived_effort": None, "workout_note": None}, "t")
    assert row == {"cadence_spm": 150, "perceived_effort": None, "workout_note": None, "detail_fetched_at": "t"}


class FakeRuns:
    def __init__(self):
        self.updates, self._filters = [], {}

    def table(self, name):
        assert name == "runs"
        return self

    def update(self, row):
        self._row = row
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def execute(self):
        self.updates.append((dict(self._filters), self._row))
        self._filters = {}
        return self


def test_saving_updates_only_that_users_run():
    sb = FakeRuns()
    save_details(sb, "me", "r1", {"training_load": 242, "workout_note": "hi"}, "t")
    assert sb.updates == [({"user_id": "me", "coros_id": "r1"}, {"training_load": 242, "workout_note": "hi", "detail_fetched_at": "t"})]


def test_one_run_failing_does_not_stop_the_others_and_dry_run_writes_nothing():
    sb = FakeRuns()
    fetched = {"r1": FULL, "r2": RuntimeError("boom"), "r3": "Sleep Overview\n\nSleep Score: 80", "r4": FULL}
    report = run_job(sb, "me", fetched, NOW, apply=False)
    assert report["read"] == 2 and report["failed"] == 2 and sb.updates == []
    applied = run_job(sb, "me", fetched, NOW, apply=True)
    assert [u[0]["coros_id"] for u in sb.updates] == ["r1", "r4"] and applied["read"] == 2


def test_the_report_shows_the_words_seen_and_a_note_count_but_never_the_note():
    report = run_job(FakeRuns(), "me", {"r1": FULL}, NOW, apply=False)
    assert report["words"]["perceived_effort"] == ["Very Easy"] and report["with_note"] == 1
    assert "Long run day" not in str(report)


def test_the_runs_job_hook_never_raises(monkeypatch):
    import ingest.coros_run_details as mod
    from ingest.coros_run_details import update_details_safely

    def boom(*a, **k):
        raise RuntimeError("COROS is down")

    monkeypatch.setattr(mod, "update_details", boom)
    message = update_details_safely(None, "me", "t", "u")
    assert message == "Run details skipped (RuntimeError)."
    assert "COROS is down" not in message  # no details of the failure in the log

    monkeypatch.setattr(mod, "update_details", lambda *a, **k: {"read": 3, "failed": 1})
    assert update_details_safely(None, "me", "t", "u") == "Run details: read 3, 1 failed."
