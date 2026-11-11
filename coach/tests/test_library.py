from decimal import Decimal

import pytest

from coach.embeddings import DIMENSIONS, MODEL, CapReached
from coach.library import MAX_DISTANCE, MAX_K, MAX_QUESTION, index_document, search
from coach.tests.fakes import FakeLibrary

TOPICS = {0: ("run", "easy", "pace", "jog"), 1: ("database", "table", "row"), 2: ("sleep", "hrv", "rest")}


class ToyEmbedder:
    """A fake embedding service. Each topic is one direction, so texts on the same topic are close. Counts its requests."""

    def __init__(self):
        self.requests = []

    def __call__(self, body):
        self.requests.append(list(body["input"]))
        data = []
        for i, text in enumerate(body["input"]):
            vector = [0.0] * DIMENSIONS
            vector[500] = 0.01  # never an all zero vector
            for axis, words in TOPICS.items():
                vector[axis] = float(sum(text.lower().count(w) for w in words))
            data.append({"index": i, "embedding": vector})
        return {"data": data, "usage": {"prompt_tokens": 10 * len(body["input"])}}


DOC = """# Guide

## Running

Easy run pace should feel gentle. Jog slowly.

## Tables

Each table has one row per day. The database keeps rows.

## Sleep

Sleep and HRV show rest.
"""


def build(doc=DOC, kind="sample", **kw):
    db, embedder = FakeLibrary(), ToyEmbedder()
    result = index_document(db, "me", "guide", doc, kind=kind, post=embedder, **kw)
    return db, embedder, result


def test_indexing_stores_every_chunk_with_its_heading_and_kind():
    db, _, result = build()
    assert result.added == 3 and result.unchanged == 0 and result.removed == 0
    assert [(c["chunk_index"], c["heading"], c["kind"]) for c in db.chunks] == [
        (0, "Guide > Running", "sample"), (1, "Guide > Tables", "sample"), (2, "Guide > Sleep", "sample")]
    assert all(len(c["embedding"]) == DIMENSIONS and c["embedding_model"] == MODEL and c["user_id"] == "me" for c in db.chunks)


def test_the_heading_is_part_of_what_is_embedded():
    _, embedder, _ = build()
    assert embedder.requests[0][0].startswith("Guide > Running\n")


def test_running_it_again_costs_nothing():
    db, embedder, _ = build()
    again = index_document(db, "me", "guide", DOC, kind="sample", post=embedder)
    assert (again.added, again.unchanged, again.tokens) == (0, 3, 0)
    assert len(embedder.requests) == 1 and len(db.chunks) == 3


def test_only_the_changed_chunk_is_embedded_again():
    db, embedder, _ = build()
    edited = DOC.replace("Jog slowly.", "Jog very slowly.")
    result = index_document(db, "me", "guide", edited, kind="sample", post=embedder)
    assert (result.added, result.unchanged) == (1, 2)
    assert len(embedder.requests[1]) == 1 and "very slowly" in db.chunks[0]["body"]
    assert len(db.chunks) == 3  # replaced in place, not duplicated


def test_chunks_past_the_end_of_a_shorter_document_are_removed():
    db, embedder, _ = build()
    short = DOC.split("## Sleep")[0]
    result = index_document(db, "me", "guide", short, kind="sample", post=embedder)
    assert result.removed == 1 and [c["chunk_index"] for c in db.chunks] == [0, 1]


def test_changing_the_kind_re_indexes_the_chunks():
    db, embedder, _ = build(kind="sample")
    result = index_document(db, "me", "guide", DOC, kind="evidence", post=embedder)
    assert result.added == 3 and {c["kind"] for c in db.chunks} == {"evidence"}


def test_the_cost_is_added_up_and_logged():
    db, _, result = build()
    assert result.tokens == 30 and result.cost == Decimal("0.0000006")
    assert [r["purpose"] for r in db.inserts] == ["embed_library"]


def test_the_cap_stops_indexing_before_anything_is_written():
    db, embedder = FakeLibrary(spent="10"), ToyEmbedder()
    with pytest.raises(CapReached):
        index_document(db, "me", "guide", DOC, kind="sample", post=embedder)
    assert db.chunks == [] and embedder.requests == []


@pytest.mark.parametrize("kwargs", [
    {"kind": "guess"}, {"kind": "Evidence"}, {"kind": "sample", "source": ""}, {"kind": "sample", "source": "x" * 121},
    {"kind": "sample", "text": "  \n "},
])
def test_bad_input_to_index_is_refused(kwargs):
    db, embedder = FakeLibrary(), ToyEmbedder()
    args = {"source": "guide", "text": DOC, **kwargs}
    with pytest.raises(ValueError):
        index_document(db, "me", args["source"], args["text"], kind=args["kind"], post=embedder)
    assert db.chunks == [] and embedder.requests == []


def test_a_question_finds_the_chunk_about_the_same_topic():
    db, embedder, _ = build()
    hits = search(db, "me", "How fast should an easy jog be?", post=embedder)
    assert hits[0].heading == "Guide > Running" and hits[0].distance < 0.1
    hits = search(db, "me", "Which table has a row per day?", post=embedder)
    assert hits[0].heading == "Guide > Tables"


def test_a_question_the_library_does_not_cover_returns_nothing():
    db, embedder, _ = build()
    assert search(db, "me", "What is the capital of France?", post=embedder) == []  # no topic words, far from every chunk


def test_the_distance_limit_cuts_off_weak_matches():
    db, embedder, _ = build()
    question = "easy run in a database"  # between two topics: 45 degrees from both
    assert len(search(db, "me", question, post=embedder, max_distance=1.0)) >= 2
    assert search(db, "me", question, post=embedder, max_distance=0.1) == []
    assert 0 < MAX_DISTANCE < 1


def test_k_limits_how_many_come_back_and_is_passed_to_the_database():
    db, embedder, _ = build()
    assert len(search(db, "me", "easy run table sleep", post=embedder, k=2, max_distance=1.0)) == 2
    assert db.rpc_calls[-1]["match_count"] == 2


def test_only_kind_is_passed_through():
    db, embedder, _ = build(kind="sample")
    assert search(db, "me", "easy run", post=embedder, only_kind="evidence") == []
    assert db.rpc_calls[-1]["only_kind"] == "evidence"


def test_hits_are_sorted_closest_first_even_if_the_database_order_is_wrong():
    db, embedder, _ = build()
    db.chunks.reverse()  # the fake sorts anyway, so also check the code's own sort by feeding unsorted rows
    unsorted = [{"id": "a", "source": "s", "kind": "sample", "heading": "", "body": "far", "distance": 0.5},
                {"id": "b", "source": "s", "kind": "sample", "heading": "", "body": "near", "distance": 0.1}]

    class Raw:
        def rpc(self, *_): return self
        def execute(self): return type("R", (), {"data": unsorted})()
        def table(self, name): return FakeLibrary().table(name)
        def __getattr__(self, name): return getattr(FakeLibrary(), name)

    hits = search(Raw(), "me", "easy run", post=embedder)
    assert [h.body for h in hits] == ["near", "far"]


def test_search_logs_its_cost_and_never_the_question():
    db, embedder, _ = build()
    before = len(db.inserts)
    search(db, "me", "my private ankle question about running", post=embedder)
    new = db.inserts[before:]
    assert [r["purpose"] for r in new] == ["embed_search"] and "ankle" not in str(new)


def test_search_respects_the_cap():
    db, embedder, _ = build()
    db._spent = "10"
    with pytest.raises(CapReached):
        search(db, "me", "easy run", post=embedder)


@pytest.mark.parametrize("kwargs", [
    {"question": ""}, {"question": "   "}, {"question": None}, {"question": "x" * (MAX_QUESTION + 1)},
    {"question": "ok", "k": 0}, {"question": "ok", "k": MAX_K + 1}, {"question": "ok", "k": True}, {"question": "ok", "k": "3"},
    {"question": "ok", "only_kind": "everything"},
])
def test_bad_input_to_search_is_refused_before_any_call(kwargs):
    db, embedder, _ = build()
    calls = len(embedder.requests)
    with pytest.raises(ValueError):
        search(db, "me", post=embedder, **kwargs)
    assert len(embedder.requests) == calls and db.rpc_calls == []
