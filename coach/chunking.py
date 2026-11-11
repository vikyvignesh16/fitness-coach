"""Lesson 6, step 1: cutting a document into chunks.

A model cannot read a whole library for every question, and an embedding of a whole document is too vague to match
one question. So we cut each document into short pieces. Each piece keeps the heading it sat under, because a chunk
that says "Never more than 14 days" means little without knowing it is about the health tool.

Rules: split at headings first, then at blank lines, pack paragraphs together up to MAX_CHARS, and keep a code block
whole when it fits. A single paragraph longer than the limit is cut at line ends, then at sentence ends.
"""
import hashlib
import re
from dataclasses import dataclass

MAX_CHARS = 800  # about 200 tokens. Small enough to match one idea, big enough to hold a whole one.

_HEADING = re.compile(r"^(#{1,4})\s+(.*\S)\s*$")
_FENCE = re.compile(r"^\s*```")


@dataclass(frozen=True)
class Chunk:
    heading: str  # like "Tables > runs"
    body: str

    def embed_text(self) -> str:
        """What gets turned into numbers: the heading and the body together."""
        return f"{self.heading}\n{self.body}" if self.heading else self.body

    def body_hash(self) -> str:
        """Fingerprint of the embedded text. If it has not changed, there is no need to embed it again."""
        return hashlib.sha256(self.embed_text().encode("utf-8")).hexdigest()


def _blocks(lines: list[str]) -> list[str]:
    """Paragraphs split on blank lines. A fenced code block is one block, blank lines inside it included."""
    blocks, current, in_fence = [], [], False
    for line in lines:
        if _FENCE.match(line):
            in_fence = not in_fence
        if not line.strip() and not in_fence:
            if current:
                blocks.append("\n".join(current).strip())
                current = []
        else:
            current.append(line)
    if current:
        blocks.append("\n".join(current).strip())
    return [b for b in blocks if b]


def _cut_long(block: str, limit: int) -> list[str]:
    """Cut one block that is too long, at line ends first, then at sentence ends, then hard."""
    pieces: list[str] = []
    for line in block.split("\n"):
        pieces.extend(re.split(r"(?<=[.!?])\s+", line) if len(line) > limit else [line])
    out, current = [], ""
    for piece in pieces:
        while len(piece) > limit:  # no break point at all: cut hard
            if current:
                out.append(current)
                current = ""
            out.append(piece[:limit])
            piece = piece[limit:]
        joined = f"{current}\n{piece}" if current else piece
        if len(joined) > limit:
            out.append(current)
            current = piece
        else:
            current = joined
    if current:
        out.append(current)
    return [p.strip() for p in out if p.strip()]


def _pack(blocks: list[str], limit: int) -> list[str]:
    """Join neighbouring blocks into chunks of at most `limit` characters."""
    chunks, current = [], ""
    for block in blocks:
        for piece in ([block] if len(block) <= limit else _cut_long(block, limit)):
            joined = f"{current}\n\n{piece}" if current else piece
            if len(joined) > limit and current:
                chunks.append(current)
                current = piece
            else:
                current = joined
    if current:
        chunks.append(current)
    return chunks


def chunk_markdown(text: str, max_chars: int = MAX_CHARS) -> list[Chunk]:
    """Cut a markdown document into chunks, oldest part first. Empty sections produce nothing."""
    if max_chars < 100:
        raise ValueError("max_chars must be at least 100.")
    sections: list[tuple[list[str], list[str]]] = []  # (heading path, lines)
    path: list[tuple[int, str]] = []
    lines: list[str] = []
    in_fence = False
    for line in text.splitlines():
        if _FENCE.match(line):
            in_fence = not in_fence
        match = None if in_fence else _HEADING.match(line)
        if match:
            sections.append(([title for _, title in path], lines))
            level = len(match.group(1))
            path = [(lv, t) for lv, t in path if lv < level] + [(level, match.group(2))]
            lines = []
        else:
            lines.append(line)
    sections.append(([title for _, title in path], lines))

    chunks: list[Chunk] = []
    for heading_path, section_lines in sections:
        heading = " > ".join(heading_path)
        # The heading is added to the embedded text, so the body gets a little less room.
        room = max_chars - len(heading) - 1 if heading else max_chars
        for body in _pack(_blocks(section_lines), max(room, 100)):
            chunks.append(Chunk(heading=heading, body=body))
    return chunks
