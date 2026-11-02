import { describe, expect, it } from "vitest";
import { photoPath, saveCheckin, type CheckinDb, type CheckinInput, type CheckinRow } from "../checkin-save";

const USER = "11111111-2222-3333-4444-555555555555";
const WEEK = "2026-11-02";

function fakeDb(opts: { user?: string | null; fail?: boolean } = {}) {
  const saved: CheckinRow[] = [];
  const db: CheckinDb = {
    async currentUserId() { return opts.user === undefined ? USER : opts.user; },
    async upsertCheckin(row) {
      if (opts.fail) throw new Error('violates constraint "checkins_secret"');
      saved.push(row);
    },
  };
  return { db, saved };
}

const input = (o: Partial<CheckinInput> = {}): CheckinInput => ({
  weightKg: "77,5", heightCm: "174", feeling: "Legs a bit heavy", painScore: "0",
  painRepeated: false, painLastedHours: "0", painWorseNextMorning: false, flags: [], photos: {}, ...o,
});

describe("saveCheckin", () => {
  it("saves a normal check in and reports no stop", async () => {
    const f = fakeDb();
    expect(await saveCheckin(f.db, WEEK, input())).toEqual({ ok: true, stop: false, message: null });
    expect(f.saved[0]).toMatchObject({
      week_start: WEEK, morning_weight_kg: 77.5, height_cm: 174, feeling: "Legs a bit heavy", pain_score: 0, pain_stop: false,
    });
  });

  it("accepts a comma as the decimal mark", async () => {
    const f = fakeDb();
    await saveCheckin(f.db, WEEK, input({ weightKg: "77,8" }));
    expect(f.saved[0].morning_weight_kg).toBe(77.8);
  });

  it("works out the pain stop itself, from the answers", async () => {
    const f = fakeDb();
    const r = await saveCheckin(f.db, WEEK, input({ painScore: "4", painRepeated: true }));
    expect(r.ok && r.stop).toBe(true);
    expect(f.saved[0].pain_stop).toBe(true);
    expect(f.saved[0].pain_stop_message).toContain("sports physio or clinician");
  });

  it("stops for a serious flag even with a pain score of 0", async () => {
    const f = fakeDb();
    const r = await saveCheckin(f.db, WEEK, input({ flags: ["swelling"] }));
    expect(r.ok && r.stop).toBe(true);
    expect(f.saved[0].pain_flags).toEqual(["swelling"]);
  });

  it("the browser cannot send a pain stop result of its own", async () => {
    const f = fakeDb();
    await saveCheckin(f.db, WEEK, { ...input({ painScore: "5", painRepeated: true }), pain_stop: false } as CheckinInput);
    expect(f.saved[0].pain_stop).toBe(true);
  });

  it("builds photo paths itself, in the user's own folder", async () => {
    const f = fakeDb();
    await saveCheckin(f.db, WEEK, input({ photos: { front: true, back: true } }));
    expect(f.saved[0].photo_front).toBe(`${USER}/checkins/${WEEK}/front.jpg`);
    expect(f.saved[0].photo_back).toBe(`${USER}/checkins/${WEEK}/back.jpg`);
    expect("photo_side" in f.saved[0]).toBe(false);
  });

  it("leaves earlier photos alone when none are uploaded this time", async () => {
    const f = fakeDb();
    await saveCheckin(f.db, WEEK, input({ photos: {} }));
    expect(Object.keys(f.saved[0]).some((k) => k.startsWith("photo_"))).toBe(false);
  });

  it("makes height optional, and trims and nulls an empty feeling", async () => {
    const f = fakeDb();
    await saveCheckin(f.db, WEEK, input({ heightCm: "", feeling: "   " }));
    expect(f.saved[0]).toMatchObject({ height_cm: null, feeling: null });
  });

  it("keeps each flag once, in alphabetical order", async () => {
    const f = fakeDb();
    await saveCheckin(f.db, WEEK, input({ flags: ["swelling", "gait_change", "swelling"] }));
    expect(f.saved[0].pain_flags).toEqual(["gait_change", "swelling"]);
  });
});

describe("saveCheckin refusals write nothing", () => {
  async function refused(i: CheckinInput, message: RegExp, week = WEEK, db = fakeDb()) {
    const r = await saveCheckin(db.db, week, i);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toMatch(message);
    expect(db.saved).toHaveLength(0);
  }

  it("a missing weight", () => refused(input({ weightKg: "" }), /Enter your weight/));
  it("a weight under 30 kg", () => refused(input({ weightKg: "29" }), /Weight/));
  it("a weight over 250 kg", () => refused(input({ weightKg: "251" }), /Weight/));
  it("a weight that is not a number", () => refused(input({ weightKg: "heavy" }), /Weight/));
  it("a height under 100 cm", () => refused(input({ heightCm: "99" }), /Height/));
  it("a height over 250 cm", () => refused(input({ heightCm: "251" }), /Height/));
  it("a pain score of 11", () => refused(input({ painScore: "11" }), /Pain score/));
  it("a decimal pain score", () => refused(input({ painScore: "2.5" }), /Pain score/));
  it("negative hours", () => refused(input({ painLastedHours: "-1" }), /Hours/));
  it("more than two weeks of hours", () => refused(input({ painLastedHours: "337" }), /Hours/));
  it("an unknown pain flag", () => refused(input({ flags: ["sore_toe"] }), /not recognised/));
  it("a feeling over 2000 characters", () => refused(input({ feeling: "x".repeat(2001) }), /2000/));
  it("a badly formed week", () => refused(input(), /week is not valid/, "2 Nov"));
  it("someone who is not signed in", () => refused(input(), /not signed in/, WEEK, fakeDb({ user: null })));
});

describe("saveCheckin when the database fails", () => {
  it("shows a plain message and never the database's own error", async () => {
    const r = await saveCheckin(fakeDb({ fail: true }).db, WEEK, input());
    expect(r).toEqual({ ok: false, error: "Could not save. Try again." });
  });
});

describe("photoPath", () => {
  it("puts the user's id first, which is what the storage rules check", () => {
    expect(photoPath(USER, WEEK, "side")).toBe(`${USER}/checkins/${WEEK}/side.jpg`);
  });
});
