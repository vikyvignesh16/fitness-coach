from datetime import datetime, timezone

from ingest.coros_health import build_rows, paris_day, parse_all, save_days, save_recovery
from ingest.tests.test_health_parse import AVG_HR, DAILY, FITNESS, HRV, LOAD, RECOVERY, RESTING, SLEEP, STRESS


class FakeTable:
    """Keeps rows by their conflict key. An upsert changes only the columns it carries, like the real database."""
    def __init__(self, key):
        self.key, self.rows, self.calls, self._filters, self._cols = key, {}, [], {}, None

    def upsert(self, row, on_conflict, default_to_null=True):
        assert on_conflict == ",".join(self.key)
        k = tuple(row[c] for c in self.key)
        self.rows.setdefault(k, {}).update(row)
        self.calls.append(row)
        return self

    def select(self, cols):
        self._cols = cols
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def order(self, col):
        self._order = col
        return self

    def execute(self):
        class R: pass
        r = R()
        r.data = sorted((v for v in self.rows.values() if all(v.get(c) == x for c, x in self._filters.items())),
                        key=lambda v: v[self._order]) if self._cols else None
        self._filters, self._cols = {}, None
        return r


class FakeSb:
    def __init__(self):
        self.tables = {"health_daily": FakeTable(("user_id", "day")), "recovery_snapshots": FakeTable(("user_id", "taken_at"))}

    def table(self, name):
        return self.tables[name]


def fetched(**over):
    base = {"sleep": SLEEP, "hrv": [HRV], "daily health": DAILY, "resting heart rate": RESTING,
            "average heart rate": AVG_HR, "stress": STRESS, "training load": LOAD, "recovery": RECOVERY, "fitness": FITNESS}
    return {**base, **over}


def test_all_tools_are_combined_by_day():
    days, recovery, fitness, report = parse_all(fetched())
    assert days["2026-11-04"]["sleep_score"] == 80 and days["2026-11-04"]["sleep_deep_min"] == 99
    assert days["2026-11-08"]["hrv_avg_ms"] == 44 and days["2026-11-08"]["load_short"] == 72
    assert days["2026-11-08"]["resting_hr"] == 55 and days["2026-11-08"]["hr_max"] == 165
    assert recovery["recovery_pct"] == 96 and fitness["vo2max"] == 50.0
    assert any("sleep:" in line for line in report)


def test_one_tool_failing_does_not_stop_the_others():
    days, _, _, report = parse_all(fetched(sleep=RuntimeError("boom"), stress="Stress Level\n\n2026-11-09:\nsomething new"))
    assert "sleep_score" not in days.get("2026-11-04", {})
    assert days["2026-11-08"]["hrv_avg_ms"] == 44
    assert any("sleep" in line and "failed" in line for line in report)
    assert any("stress" in line and "could not read" in line for line in report)


def test_an_unreadable_recovery_is_skipped_not_guessed():
    _, recovery, _, report = parse_all(fetched(recovery="Recovery Status\n\nLevel: Fresh"))
    assert recovery == {} and any("recovery: skipped" in line for line in report)


def test_a_day_is_complete_only_after_paris_midnight():
    rows = build_rows({"2026-11-08": {"steps": 1}, "2026-11-09": {"steps": 2}}, today="2026-11-09", fitness={"vo2max": 50.0})
    assert rows["2026-11-08"]["complete"] is True
    assert rows["2026-11-09"] == {"steps": 2, "complete": False, "vo2max": 50.0}


def test_fitness_lands_on_todays_row_even_if_no_other_data_came():
    rows = build_rows({}, today="2026-11-09", fitness={"vo2max": 50.0})
    assert rows == {"2026-11-09": {"complete": False, "vo2max": 50.0}}


def test_saving_twice_gives_one_row_per_day():
    sb = FakeSb()
    rows = build_rows(parse_all(fetched())[0], "2026-11-09", {})
    save_days(sb, "me", rows, "2026-11-09T10:00:00+01:00")
    save_days(sb, "me", rows, "2026-11-09T13:00:00+01:00")
    assert len(sb.tables["health_daily"].rows) == len(rows)


def test_a_later_pull_with_less_data_never_blanks_a_stored_value():
    sb = FakeSb()
    save_days(sb, "me", {"2026-11-08": {"steps": 5000, "hrv_avg_ms": 44, "complete": True}}, "t1")
    save_days(sb, "me", {"2026-11-08": {"steps": 5200, "complete": True}}, "t2")
    row = sb.tables["health_daily"].rows[("me", "2026-11-08")]
    assert row["steps"] == 5200 and row["hrv_avg_ms"] == 44


def test_recovery_snapshots_roll_up_into_the_day():
    sb = FakeSb()
    # 22:30 UTC on 8 Nov is 23:30 in Paris, still 8 Nov. 23:30 UTC is already 9 Nov in Paris.
    assert paris_day(datetime(2026, 11, 8, 22, 30, tzinfo=timezone.utc)) == "2026-11-08"
    assert paris_day(datetime(2026, 11, 8, 23, 30, tzinfo=timezone.utc)) == "2026-11-09"
    save_recovery(sb, "me", {"recovery_pct": 96, "level": "Fresh"}, datetime(2026, 11, 9, 7, 0, tzinfo=timezone.utc))
    rollup = save_recovery(sb, "me", {"recovery_pct": 80}, datetime(2026, 11, 9, 10, 0, tzinfo=timezone.utc))
    assert rollup == {"recovery_avg": 88.0, "recovery_min": 80, "recovery_max": 96, "recovery_last": 80}


def test_the_same_snapshot_time_is_not_saved_twice():
    sb = FakeSb()
    when = datetime(2026, 11, 9, 7, 0, tzinfo=timezone.utc)
    save_recovery(sb, "me", {"recovery_pct": 96}, when)
    save_recovery(sb, "me", {"recovery_pct": 96}, when)
    assert len(sb.tables["recovery_snapshots"].rows) == 1


def test_the_rollup_uses_only_that_days_snapshots():
    sb = FakeSb()
    save_recovery(sb, "me", {"recovery_pct": 20}, datetime(2026, 11, 8, 12, 0, tzinfo=timezone.utc))
    rollup = save_recovery(sb, "me", {"recovery_pct": 90}, datetime(2026, 11, 9, 12, 0, tzinfo=timezone.utc))
    assert rollup == {"recovery_avg": 90.0, "recovery_min": 90, "recovery_max": 90, "recovery_last": 90}
