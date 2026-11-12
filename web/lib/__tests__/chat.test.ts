import { describe, expect, it } from "vitest";
import { MAX_TEXT, isUuid, monthStartUtc, noticesFor, parseThreadParam, spendLine, threadTitle } from "../chat";

const ID = "7f3a1b2c-1111-4222-8333-444455556666";
const none = { revised: false, replaced: false, blocked: false, stopped: false };

describe("thread id from the address", () => {
  it("accepts a real id and lower cases it", () => {
    expect(parseThreadParam(ID)).toBe(ID);
    expect(parseThreadParam(ID.toUpperCase())).toBe(ID);
  });
  it.each([undefined, null, "", "abc", "7f3a1b2c", `${ID}x`, ` ${ID}`, [ID], 5, { id: ID }, "'; drop table chat_threads;--"])(
    "ignores %j", (value) => expect(parseThreadParam(value)).toBeNull());
  it("isUuid agrees", () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid("nope")).toBe(false);
  });
});

describe("start of the month in Paris", () => {
  it("is 23:00 UTC the evening before in winter", () => expect(monthStartUtc("2026-11-12")).toBe("2026-10-31T23:00:00.000Z"));
  it("is 22:00 UTC the evening before in summer", () => expect(monthStartUtc("2026-07-20")).toBe("2026-06-30T22:00:00.000Z"));
  it("uses the offset of the 1st, so the October clock change does not move the start of October or November", () => {
    expect(monthStartUtc("2026-10-28")).toBe("2026-09-30T22:00:00.000Z"); // still summer time on 1 October
    expect(monthStartUtc("2026-11-01")).toBe("2026-10-31T23:00:00.000Z"); // winter time on 1 November
  });
  it("works for January", () => expect(monthStartUtc("2027-01-31")).toBe("2026-12-31T23:00:00.000Z"));
});

describe("spend line", () => {
  it("is fine below 80 percent", () => expect(spendLine({ spentUsd: 7.99, capUsd: 10 })).toEqual({ text: "This month: $7.99 of $10.00", level: "ok" }));
  it("is careful from 80 percent", () => expect(spendLine({ spentUsd: 8, capUsd: 10 }).level).toBe("careful"));
  it("stops at the cap", () => expect(spendLine({ spentUsd: 10, capUsd: 10 }).level).toBe("stop"));
  it("stops over the cap", () => expect(spendLine({ spentUsd: 12, capUsd: 10 }).level).toBe("stop"));
  it("stops when the cap is zero", () => expect(spendLine({ spentUsd: 0, capUsd: 0 }).level).toBe("stop"));
});

describe("notices", () => {
  it("says nothing when nothing happened", () => expect(noticesFor(none)).toEqual([]));
  it("says when an answer was checked and written again", () => expect(noticesFor({ ...none, revised: true })[0]).toMatch(/wrote it again/));
  it("says a replaced answer is a fixed message, and not also that it was rewritten", () => {
    const notes = noticesFor({ ...none, revised: true, replaced: true });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/fixed message/);
  });
  it("says when the cap or the step limit stopped it", () => {
    expect(noticesFor({ ...none, blocked: true })[0]).toMatch(/spending cap/);
    expect(noticesFor({ ...none, stopped: true })[0]).toMatch(/too many steps/);
  });
});

describe("titles and limits", () => {
  it("uses the title, or the date when there is none", () => {
    expect(threadTitle({ id: ID, title: " Sleep ", created_at: "2026-11-12T08:00:00Z" })).toBe("Sleep");
    expect(threadTitle({ id: ID, title: null, created_at: "2026-11-12T08:00:00Z" })).toBe("Chat from 2026-11-12");
    expect(threadTitle({ id: ID, title: "  ", created_at: "2026-11-12T08:00:00Z" })).toBe("Chat from 2026-11-12");
  });
  it("matches the coach service limit", () => expect(MAX_TEXT).toBe(2000));
});
