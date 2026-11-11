import pytest

from coach.chunking import MAX_CHARS, Chunk, chunk_markdown

DOC = """# Guide

Intro line.

## Tables

### runs

One row per run.

Never holds notes.

### plan_days

One row per planned day.
"""


def test_headings_become_a_path():
    chunks = chunk_markdown(DOC)
    assert [c.heading for c in chunks] == ["Guide", "Guide > Tables > runs", "Guide > Tables > plan_days"]


def test_a_section_with_no_text_makes_no_chunk():
    # "## Tables" has no text of its own, so nothing is emitted for it
    assert "Guide > Tables" not in [c.heading for c in chunk_markdown(DOC)]


def test_small_paragraphs_in_one_section_are_packed_together():
    chunk = chunk_markdown(DOC)[1]
    assert chunk.body == "One row per run.\n\nNever holds notes."


def test_a_sibling_heading_replaces_the_previous_one_in_the_path():
    chunks = chunk_markdown("# A\n\n## B\n\nbee\n\n## C\n\nsea\n")
    assert [c.heading for c in chunks] == ["A > B", "A > C"]


def test_no_chunk_is_longer_than_the_limit_with_its_heading():
    long_text = " ".join(f"Sentence number {i} says something useful." for i in range(200))
    chunks = chunk_markdown(f"# Long\n\n{long_text}\n", max_chars=300)
    assert len(chunks) > 3
    assert all(len(c.embed_text()) <= 300 for c in chunks)


def test_nothing_is_lost_when_a_long_paragraph_is_cut():
    words = [f"word{i}" for i in range(400)]
    chunks = chunk_markdown("\n".join(" ".join(words[i:i + 10]) for i in range(0, 400, 10)), max_chars=200)
    assert " ".join(" ".join(c.body.split()) for c in chunks).split() == words


def test_text_with_no_break_points_is_cut_hard():
    chunks = chunk_markdown("x" * 1000, max_chars=300)
    assert [len(c.body) for c in chunks] == [300, 300, 300, 100]


def test_a_code_block_with_a_blank_line_stays_in_one_chunk():
    doc = "# Q\n\n```sql\nselect 1;\n\nselect 2;\n```\n"
    assert chunk_markdown(doc)[0].body == "```sql\nselect 1;\n\nselect 2;\n```"


def test_a_hash_inside_a_code_block_is_not_a_heading():
    doc = "# Q\n\n```\n# just a comment\n```\n"
    chunks = chunk_markdown(doc)
    assert len(chunks) == 1 and chunks[0].heading == "Q"


def test_embed_text_puts_the_heading_first():
    assert Chunk("A > B", "body").embed_text() == "A > B\nbody"
    assert Chunk("", "body").embed_text() == "body"


def test_hash_is_stable_and_changes_with_the_text():
    a, b = Chunk("H", "one"), Chunk("H", "two")
    assert a.body_hash() == Chunk("H", "one").body_hash()
    assert a.body_hash() != b.body_hash()
    assert a.body_hash() != Chunk("Other", "one").body_hash()  # the heading is part of what is embedded
    assert len(a.body_hash()) == 64  # the database requires this


def test_empty_and_blank_documents_give_no_chunks():
    assert chunk_markdown("") == []
    assert chunk_markdown("\n\n   \n") == []


def test_a_tiny_limit_is_refused():
    with pytest.raises(ValueError):
        chunk_markdown("text", max_chars=10)


def test_default_limit_is_the_one_the_database_allows():
    assert MAX_CHARS <= 2000  # library_chunks.body check
