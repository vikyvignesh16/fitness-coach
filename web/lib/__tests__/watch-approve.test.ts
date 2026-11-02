import { describe, expect, it } from "vitest";
import {
  approveRuns, runState, upcomingRuns, waitingCount, type ApproveDb, type PlannedRun,
} from "../watch-approve";
import type { PlanDay } from "../types";

const TODAY = "2026-11-03";
const RECOVERY: PlannedRun = { week: 2, type: "recovery", distanceKm: 5 };

function fakeDb(opts: { runs?: Record<string, PlannedRun | null>; locked?: boolean; version?: string | null; fail?: boolean; painStop?: boolean } = {}) {
  const approvals = new Map<string, string>();
  const calls: string[] = [];
  const db: ApproveDb = {
    async getPlannedRun(date) {
      calls.push("plan");
      return opts.runs ? (opts.runs[date] ?? null) : RECOVERY;
    },
    async isWeekLocked() { calls.push("lock"); return opts.locked ?? false; },
    async isPainStopped() { return opts.painStop ?? false; },
    async planVersionId() { return opts.version === undefined ? "v1" : opts.version; },
    async insertApproval(row) {
      if (opts.fail) throw new Error('duplicate key value violates unique constraint "secret_index_name"');
      if (approvals.has(row.subject_date)) return "exists";
      approvals.set(row.subject_date, row.plan_version_id);
      return "created";
    },
  };
  return { db, approvals, calls };
}

describe("approveRuns", () => {
  it("approves a planned run for a coming day", async () => {
    const f = fakeDb();
    expect(await approveRuns(f.db, ["2026-11-04"], TODAY)).toEqual([{ date: "2026-11-04", status: "approved" }]);
    expect(f.approvals.get("2026-11-04")).toBe("v1");
  });

  it("allows today and the 90th day ahead, but not the 91st", async () => {
    expect((await approveRuns(fakeDb().db, [TODAY], TODAY))[0].status).toBe("approved");
    expect((await approveRuns(fakeDb().db, ["2027-02-01"], TODAY))[0].status).toBe("approved"); // 90 days
    const late = (await approveRuns(fakeDb().db, ["2027-02-02"], TODAY))[0];
    expect(late.status).toBe("refused");
    expect(late.status === "refused" && late.error).toMatch(/90 days/);
  });

  it("refuses everything while the newest check in says stop, and writes nothing", async () => {
    const f = fakeDb({ painStop: true });
    const r = await approveRuns(f.db, ["2026-11-04", "2026-11-06"], TODAY);
    expect(r.every((x) => x.status === "refused")).toBe(true);
    expect(r[0].status === "refused" && r[0].error).toMatch(/sports physio or clinician/);
    expect(f.approvals.size).toBe(0);
  });

  it("refuses a day that has passed", async () => {
    const r = (await approveRuns(fakeDb().db, ["2026-11-02"], TODAY))[0];
    expect(r).toMatchObject({ status: "refused", error: "That day has already passed." });
  });

  it("approving the same day twice gives 'already' and one row", async () => {
    const f = fakeDb();
    await approveRuns(f.db, ["2026-11-04"], TODAY);
    expect((await approveRuns(f.db, ["2026-11-04"], TODAY))[0].status).toBe("already");
    expect(f.approvals.size).toBe(1);
  });

  it("refuses a rest day, an unknown day and a run of 0 km", async () => {
    const f = fakeDb({ runs: { "2026-11-04": { week: 2, type: "no_run", distanceKm: 0 }, "2026-11-05": { week: 2, type: "easy", distanceKm: 0 } } });
    for (const d of ["2026-11-04", "2026-11-05", "2026-11-06"]) {
      expect((await approveRuns(f.db, [d], TODAY))[0]).toMatchObject({ status: "refused", error: "No run is planned for that day." });
    }
    expect(f.approvals.size).toBe(0);
  });

  it("refuses a locked week and writes nothing", async () => {
    const f = fakeDb({ locked: true });
    const r = (await approveRuns(f.db, ["2026-11-04"], TODAY))[0];
    expect(r).toMatchObject({ status: "refused" });
    expect(r.status === "refused" && r.error).toMatch(/locked/);
    expect(f.approvals.size).toBe(0);
  });

  it("refuses badly formed dates without touching the database", async () => {
    const f = fakeDb();
    for (const bad of ["9 Nov", "2026-13-45", "'; drop table approvals; --", ""]) {
      expect((await approveRuns(f.db, [bad], TODAY))[0].status).toBe("refused");
    }
    expect(f.calls).toEqual([]);
  });

  it("one refusal does not stop the other days", async () => {
    const f = fakeDb({ runs: { "2026-11-04": RECOVERY, "2026-11-05": null, "2026-11-06": RECOVERY } });
    const r = await approveRuns(f.db, ["2026-11-04", "2026-11-05", "2026-11-06"], TODAY);
    expect(r.map((x) => x.status)).toEqual(["approved", "refused", "approved"]);
  });

  it("ignores repeated dates in one call", async () => {
    expect(await approveRuns(fakeDb().db, ["2026-11-04", "2026-11-04"], TODAY)).toHaveLength(1);
  });

  it("refuses more than 14 days at once", async () => {
    const dates = Array.from({ length: 15 }, (_, i) => `2026-11-${String(4 + i).padStart(2, "0")}`);
    const r = await approveRuns(fakeDb().db, dates, TODAY);
    expect(r.every((x) => x.status === "refused")).toBe(true);
  });

  it("does nothing for an empty list", async () => {
    expect(await approveRuns(fakeDb().db, [], TODAY)).toEqual([]);
  });

  it("refuses when the plan cannot be found", async () => {
    const r = (await approveRuns(fakeDb({ version: null }).db, ["2026-11-04"], TODAY))[0];
    expect(r.status).toBe("refused");
  });

  it("shows a plain message, never the database's own error", async () => {
    const r = (await approveRuns(fakeDb({ fail: true }).db, ["2026-11-04"], TODAY))[0];
    expect(r).toEqual({ date: "2026-11-04", status: "refused", error: "Could not save. Try again." });
  });
});

describe("runState", () => {
  it("moves from waiting to queued to sent, and can fail", () => {
    expect(runState(undefined)).toBe("waiting");
    expect(runState({ subject_date: "d", sent_at: null, send_error: null })).toBe("queued");
    expect(runState({ subject_date: "d", sent_at: "2026-11-03T10:00:00Z", send_error: null })).toBe("sent");
    expect(runState({ subject_date: "d", sent_at: null, send_error: "COROS said no" })).toBe("failed");
  });

  it("treats a sent workout as sent even if an old error is still recorded", () => {
    expect(runState({ subject_date: "d", sent_at: "2026-11-03T10:00:00Z", send_error: "old" })).toBe("sent");
  });
});

describe("upcomingRuns", () => {
  const day = (date: string, week: number, type: string, km: number): PlanDay =>
    ({ date, week, run: { type, distance_km: km }, gym: null });
  const days = [
    day("2026-11-02", 2, "recovery", 5), // yesterday
    day("2026-11-03", 2, "easy", 7),
    day("2026-11-04", 2, "no_run", 0),
    day("2026-11-05", 2, "quality", 8),
    day("2026-11-12", 3, "easy", 6),
    day("2026-11-20", 4, "easy", 6),
  ];

  it("lists runs from today for the horizon, skipping rest days and the past", () => {
    const r = upcomingRuns(days, [], [], TODAY, 14);
    expect(r.map((x) => x.day.date)).toEqual(["2026-11-03", "2026-11-05", "2026-11-12"]);
  });

  it("includes the 14th day and excludes the 15th", () => {
    const r = upcomingRuns([day("2026-11-16", 3, "easy", 5), day("2026-11-17", 3, "easy", 5)], [], [], TODAY, 14);
    expect(r.map((x) => x.day.date)).toEqual(["2026-11-16"]);
  });

  it("attaches each day's state, lock and error", () => {
    const r = upcomingRuns(days, [
      { subject_date: "2026-11-03", sent_at: "2026-11-03T08:00:00Z", send_error: null },
      { subject_date: "2026-11-05", sent_at: null, send_error: "bad" },
    ], [3], TODAY, 14);
    expect(r.map((x) => x.state)).toEqual(["sent", "failed", "waiting"]);
    expect(r.map((x) => x.locked)).toEqual([false, false, true]);
    expect(r[1].error).toBe("bad");
  });

  it("counts only unapproved, unlocked runs as waiting", () => {
    const r = upcomingRuns(days, [{ subject_date: "2026-11-03", sent_at: null, send_error: null }], [3], TODAY, 14);
    expect(waitingCount(r)).toBe(1); // 11-05 only: 11-03 is queued, 11-12 is in a locked week
  });
});
