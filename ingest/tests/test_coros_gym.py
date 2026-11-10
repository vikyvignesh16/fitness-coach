from datetime import datetime, timezone

from ingest.coros_gym import run_job, save_one, save_sessions, save_sets, session_update
from ingest.tests.test_strength_parse import DETAIL, LAPS, sets_json

NOW = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)


class FakeTable:
    def __init__(self, key):
        self.key, self.rows, self.ops, self._f, self._after = key, {}, [], {}, None

    def upsert(self, row, on_conflict, default_to_null=True):
        assert on_conflict == ",".join(self.key) and default_to_null is False
        self.rows.setdefault(tuple(row[c] for c in self.key), {}).update(row)
        return self

    def select(self, cols):
        self._select = True
        return self

    def update(self, row):
        self._update = row
        return self

    def delete(self):
        self._delete = True
        return self

    def eq(self, col, val):
        self._f[col] = val
        return self

    def gt(self, col, val):
        self._after = (col, val)
        return self

    def execute(self):
        class R: pass
        r = R()
        match = [v for v in self.rows.values() if all(v.get(c) == x for c, x in self._f.items())]
        if getattr(self, "_delete", False):
            for k in [k for k, v in self.rows.items() if v in match and (not self._after or v[self._after[0]] > self._after[1])]:
                del self.rows[k]
            self.ops.append(("delete", dict(self._f), self._after))
        elif getattr(self, "_update", None) is not None:
            for v in match:
                v.update(self._update)
            self.ops.append(("update", dict(self._f), self._update))
        r.data = match if getattr(self, "_select", False) else None
        self._f, self._after, self._select, self._update, self._delete = {}, None, False, None, False
        return r


class FakeSb:
    def __init__(self):
        self.t = {"strength_sessions": FakeTable(("user_id", "coros_id")), "strength_sets": FakeTable(("session_id", "position"))}

    def table(self, name):
        return self.t[name]


def with_session(sb, coros_id="c1"):
    save_sessions(sb, "me", [{"coros_id": coros_id, "started_at": "2026-11-07T11:00:00+00:00", "day": "2026-11-07", "workout_name": None, "duration_s": 100}])
    row = sb.t["strength_sessions"].rows[("me", coros_id)]
    row["id"] = "sid-" + coros_id
    return row


def test_a_session_is_saved_once_per_id_and_none_values_are_not_written():
    sb = FakeSb()
    with_session(sb)
    save_sessions(sb, "me", [{"coros_id": "c1", "started_at": "x", "day": "2026-11-07", "workout_name": "Legs", "duration_s": None}])
    row = sb.t["strength_sessions"].rows[("me", "c1")]
    assert len(sb.t["strength_sessions"].rows) == 1 and row["workout_name"] == "Legs" and row["duration_s"] == 100


def test_the_update_leaves_out_empty_values_but_clears_the_two_you_can_edit():
    row = session_update({"training_load": None, "duration_s": 60, "perceived_effort": None, "workout_note": None}, "t")
    assert row == {"duration_s": 60, "perceived_effort": None, "workout_note": None, "detail_fetched_at": "t"}


def test_saving_a_session_writes_its_detail_and_its_sets():
    sb = FakeSb()
    with_session(sb)
    save_one(sb, "me", "c1", {"training_load": 30, "workout_note": "hi"}, [{"position": 1, "exercise": "Press", "reps": 12}], "t")
    assert sb.t["strength_sessions"].rows[("me", "c1")]["training_load"] == 30
    assert list(sb.t["strength_sets"].rows.values()) == [{"position": 1, "exercise": "Press", "reps": 12, "user_id": "me", "session_id": "sid-c1"}]


def test_a_shorter_session_leaves_no_old_sets_behind():
    sb = FakeSb()
    save_sets(sb, "me", "s1", [{"position": i, "exercise": "Press", "reps": 10} for i in (1, 2, 3, 4)])
    save_sets(sb, "me", "s1", [{"position": i, "exercise": "Press", "reps": 10} for i in (1, 2)])
    assert sorted(k[1] for k in sb.t["strength_sets"].rows) == [1, 2]


def test_saving_the_same_sets_twice_gives_the_same_rows():
    sb = FakeSb()
    sets = [{"position": i, "exercise": "Press", "reps": 10} for i in (1, 2, 3)]
    save_sets(sb, "me", "s1", sets)
    save_sets(sb, "me", "s1", sets)
    assert len(sb.t["strength_sets"].rows) == 3


def test_saving_for_a_session_that_is_not_saved_yet_raises_instead_of_guessing():
    import pytest
    with pytest.raises(ValueError, match="not saved yet"):
        save_one(FakeSb(), "me", "nope", {}, [], "t")


def test_one_session_failing_does_not_stop_the_others_and_a_dry_run_writes_nothing():
    sb = FakeSb()
    with_session(sb, "c1")
    with_session(sb, "c3")
    good = (DETAIL, sets_json(LAPS))
    fetched = {"c1": good, "c2": RuntimeError("boom"), "c3": good, "c4": ("Sleep Overview", sets_json(LAPS))}
    dry = run_job(sb, "me", fetched, NOW, apply=False)
    assert (dry["read"], dry["failed"], dry["sets"]) == (2, 2, 6) and sb.t["strength_sets"].rows == {}
    run_job(sb, "me", fetched, NOW, apply=True)
    assert len(sb.t["strength_sets"].rows) == 6


def test_the_report_has_counts_and_words_but_never_the_note():
    report = run_job(FakeSb(), "me", {"c1": (DETAIL, sets_json(LAPS))}, NOW, apply=False)
    assert report["with_note"] == 1 and report["words"]["perceived_effort"] == ["Easy"]
    assert "Shoulders felt good" not in str(report)


def test_the_runs_job_hook_never_raises(monkeypatch):
    import ingest.coros_gym as mod

    def boom(*a, **k):
        raise RuntimeError("COROS is down")

    monkeypatch.setattr(mod, "update_gym", boom)
    message = mod.update_gym_safely(None, "me", "t", "u")
    assert message == "Gym skipped (RuntimeError)." and "COROS is down" not in message
    monkeypatch.setattr(mod, "update_gym", lambda *a, **k: {"listed": 3, "read": 2, "sets": 40, "failed": 1})
    assert mod.update_gym_safely(None, "me", "t", "u") == "Gym: listed 3, read 2 (40 sets), 1 failed."


def test_a_session_the_database_rejects_does_not_stop_the_others_and_only_the_error_type_is_reported():
    class Rejecting(FakeSb):
        def table(self, name):
            t = super().table(name)
            if name == "strength_sets" and not getattr(self, "_armed", False):
                orig = t.upsert

                def upsert(row, on_conflict, default_to_null=True):
                    if row["session_id"] == "sid-bad":
                        raise RuntimeError("violates check constraint, reps 1177, my private note")
                    return orig(row, on_conflict, default_to_null)

                t.upsert = upsert
                self._armed = True
            return t

    sb = Rejecting()
    for cid in ("c1", "bad", "c3"):
        with_session(sb, cid)
    good = (DETAIL, sets_json(LAPS))
    report = run_job(sb, "me", {"c1": good, "bad": good, "c3": good}, NOW, apply=True)
    assert (report["read"], report["failed"]) == (2, 1)
    assert report["errors"] == ["RuntimeError"]
    assert "private note" not in str(report) and "1177" not in str(report)
    assert {k[0] for k in sb.t["strength_sets"].rows} == {"sid-c1", "sid-c3"}


def test_a_session_whose_sets_could_not_be_saved_is_not_marked_as_read_so_it_is_tried_again():
    import pytest

    class FailingSets(FakeSb):
        def table(self, name):
            t = super().table(name)
            if name == "strength_sets":
                def boom(*a, **k):
                    raise RuntimeError("check constraint")
                t.upsert = boom
            return t

    sb = FailingSets()
    with_session(sb, "c1")
    with pytest.raises(RuntimeError):
        save_one(sb, "me", "c1", {"training_load": 30}, [{"position": 1, "exercise": "Press", "reps": 12}], "t")
    assert "detail_fetched_at" not in sb.t["strength_sessions"].rows[("me", "c1")]
    assert "training_load" not in sb.t["strength_sessions"].rows[("me", "c1")]
