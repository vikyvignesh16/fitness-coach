import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { feedResponse, tokenFromPath, type FeedDb } from "../calendar-feed";
import { hashToken, newFeedToken, TOKEN_PATTERN } from "../feed-token";
import type { FeedData } from "../ics";

const GOOD = "A".repeat(43);
const data: FeedData = {
  version: "5.1",
  days: [{ date: "2026-11-08", week: 2, run: { type: "long_run", distance_km: 14 } }],
  gates: [{ passed: true, created_at: "2026-11-02T19:00:00Z" }],
};
const valid = (t: string) => TOKEN_PATTERN.test(t);
const dbReturning = (v: FeedData | null): FeedDb & { feed: ReturnType<typeof vi.fn> } => ({ feed: vi.fn(async () => v) });

describe("feedResponse", () => {
  it("returns the calendar for a good token", async () => {
    const db = dbReturning(data);
    const r = await feedResponse(`${GOOD}.ics`, db, valid);
    expect(r.status).toBe(200);
    expect(r.type).toContain("text/calendar");
    expect(r.body).toContain("SUMMARY:Long run 14 km");
    expect(db.feed).toHaveBeenCalledWith(GOOD);
  });

  it("answers 404 and shows nothing for an unknown token", async () => {
    const r = await feedResponse(`${GOOD}.ics`, dbReturning(null), valid);
    expect(r).toMatchObject({ status: 404, body: "Not found" });
  });

  it("never asks the database about a token of the wrong shape", async () => {
    const db = dbReturning(data);
    for (const bad of ["", ".ics", "short.ics", `${GOOD}x.ics`, `${GOOD.slice(1)}!.ics`, "../../etc/passwd", "a b"]) {
      expect((await feedResponse(bad, db, valid)).status).toBe(404);
    }
    expect(db.feed).not.toHaveBeenCalled();
  });

  it("hides database errors behind a plain 500", async () => {
    const db: FeedDb = { feed: async () => { throw new Error("relation calendar_feeds secret details"); } };
    const r = await feedResponse(`${GOOD}.ics`, db, valid);
    expect(r.status).toBe(500);
    expect(r.body).not.toMatch(/relation|secret|calendar_feeds/);
  });
});

describe("tokenFromPath", () => {
  it("strips .ics once", () => {
    expect(tokenFromPath("abc.ics")).toBe("abc");
    expect(tokenFromPath("abc")).toBe("abc");
    expect(tokenFromPath("abc.ics.ics")).toBe("abc.ics");
  });
});

describe("feed tokens", () => {
  it("makes a long url safe token that matches the pattern, and a different one each time", () => {
    const a = newFeedToken();
    const b = newFeedToken();
    expect(a.token).toMatch(TOKEN_PATTERN);
    expect(a.token).not.toBe(b.token);
  });

  it("stores the sha256 hex of the token, which is what the database function compares", () => {
    const { token, hash } = newFeedToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toContain(token);
  });
});
