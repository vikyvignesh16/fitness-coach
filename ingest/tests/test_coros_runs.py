import json

import pytest

from ingest.coros_runs import parse_sport_records, save_runs, to_seconds

SAMPLE = """Sport Records — 2026-10-19 to 2026-11-02 (4 records)
========================

1. Outdoor Run — 2026-10-28
   Location: London Run
   Start Coordinates: 51.508999, -0.063000
   Time Window: startTimestamp=1793212997 | endTimestamp=1793215774
   Duration: 46:16 | Distance: 8.01 km
   Average Pace: 5:47 /km | Avg HR: 155 bpm | Calories: 741 kcal
   LabelId: 481362696762064996 | SportType: 100

2. Strength — 2026-10-28
   Location: Strength
   Time Window: startTimestamp=1793180990 | endTimestamp=1793184215
   Duration: 42:02 | Sets: 20
 | Avg HR: 94 bpm | Calories: 355 kcal
   LabelId: 481354609340743886 | SportType: 402

3. Outdoor Run — 2026-10-25
   Location: London Run
   Time Window: startTimestamp=1792935292 | endTimestamp=1792940379
   Duration: 1:24:46 | Distance: 15.01 km
   Average Pace: 5:39 /km | Calories: 1378 kcal
   LabelId: 481288776350466448 | SportType: 100

4. Strength — 2026-10-22
   Time Window: startTimestamp=1792691907 | endTimestamp=1792696693
   Duration: 45:22 | Sets: 8
   LabelId: 481239818016162293 | SportType: 402
"""


def test_clock_to_seconds():
    assert to_seconds("46:16") == 2776
    assert to_seconds("1:24:46") == 5086


def test_parses_runs_and_skips_strength():
    runs = parse_sport_records(SAMPLE)
    assert [r["coros_id"] for r in runs] == ["481362696762064996", "481288776350466448"]
    first = runs[0]
    assert first["distance_km"] == 8.01
    assert first["duration_s"] == 2776
    assert first["avg_hr"] == 155
    assert first["started_at"].startswith("2026-10-28")


def test_parses_the_json_string_form_coros_really_sends():
    wrapped = json.dumps(SAMPLE)  # quotes around it, newlines as \n
    assert wrapped.startswith('"') and "\\n" in wrapped
    assert parse_sport_records(wrapped) == parse_sport_records(SAMPLE)


def test_missing_heart_rate_is_none():
    assert parse_sport_records(SAMPLE)[1]["avg_hr"] is None


def test_count_mismatch_raises():
    with pytest.raises(ValueError, match="said 5"):
        parse_sport_records(SAMPLE.replace("(4 records)", "(5 records)"))


def test_missing_header_raises():
    with pytest.raises(ValueError):
        parse_sport_records("something else entirely")


def test_missing_required_field_raises():
    broken = SAMPLE.replace("Distance: 8.01 km", "Distance: unknown")
    with pytest.raises(ValueError, match="missing a field"):
        parse_sport_records(broken)


SHORT = """Sport Records — 2026-10-29 to 2026-11-03 (1 records)
========================

1. Outdoor Run — 2026-10-29
   Location: London Run
   Start Coordinates: 51.508999, -0.063000
   Time Window: startTimestamp=1793301607 | endTimestamp=1793303088
   Duration: 24:22 | Distance: 792 m
   Average Pace: 30:47 /km | Calories: 71 kcal
   LabelId: 481481574748029028 | SportType: 100
"""


def test_distance_under_a_km_comes_in_metres():
    # COROS writes "792 m" for short activities, "8.01 km" for longer ones.
    runs = parse_sport_records(SHORT)
    assert runs[0]["distance_km"] == 0.792


TREADMILL = """Sport Records — 2026-03-01 to 2026-03-08 (3 records)
========================

1. Indoor Run — 2026-03-08
   Time Window: startTimestamp=1772952186 | endTimestamp=1772958022
   Duration: 1:37:16

   LabelId: 480124298776838347 | SportType: 101

2. Outdoor Run — 2026-03-07
   Time Window: startTimestamp=1772870000 | endTimestamp=1772873000
   Duration: 50:00 | Distance: 10.00 km
   LabelId: 480124298776838111 | SportType: 100

3. Indoor Run — 2026-03-04
   Time Window: startTimestamp=1772604533 | endTimestamp=1772607137
   Duration: 43:24 | Distance: 8.2 km
   LabelId: 480124301729628271 | SportType: 101
"""


def test_indoor_run_without_distance_is_skipped_and_reported():
    skipped: list[dict] = []
    runs = parse_sport_records(TREADMILL, skipped)
    assert [r["coros_id"] for r in runs] == ["480124298776838111", "480124301729628271"]
    assert skipped == [{"coros_id": "480124298776838347", "date": "2026-03-08", "reason": "indoor run with no distance"}]


def test_indoor_run_with_distance_is_kept():
    assert parse_sport_records(TREADMILL)[1]["distance_km"] == 8.2


def test_outdoor_run_without_distance_still_raises():
    broken = TREADMILL.replace("Distance: 10.00 km", "")
    with pytest.raises(ValueError, match="missing a field"):
        parse_sport_records(broken)


def test_zero_records_is_fine():
    assert parse_sport_records("Sport Records — a to b (0 records)\n") == []


class FakeRuns:
    def __init__(self):
        self.rows = {}

    def table(self, name):
        assert name == "runs"
        return self

    def upsert(self, rows, on_conflict):
        assert on_conflict == "user_id,coros_id"
        for r in rows:
            self.rows[(r["user_id"], r["coros_id"])] = r
        return self

    def execute(self):
        return self


def test_saving_twice_gives_no_duplicates():
    sb = FakeRuns()
    runs = parse_sport_records(SAMPLE)
    save_runs(sb, "me", runs)
    save_runs(sb, "me", runs)
    assert len(sb.rows) == 2
