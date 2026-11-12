import { describe, expect, it } from "vitest";
import {
  GROUPS, averageChatCall, breakdown, bucketCosts, bucketKeys, chartTable, failures, formatUsd, groupPurpose,
  lookbackStartDay, monthForecast, parseCostView, parisDay, thisMonth, totals, type CallRow,
} from "../costs";

const TODAY = "2026-11-12"; // a Thursday. Monday of that week is 2026-11-09

function row(at: string, cost: number | string, over: Partial<CallRow> = {}): CallRow {
  return { at, purpose: "chat", model: "openai/gpt-6-luna", input_tokens: 100, output_tokens: 50, cost_usd: cost, ok: true, error: null, ...over };
}

describe("which day a receipt belongs to (Paris time)", () => {
  it("moves a late evening UTC time to the next Paris day in winter (UTC+1)", () => {
    expect(parisDay("2026-11-11T23:30:00Z")).toBe("2026-11-12");
    expect(parisDay("2026-11-11T22:59:00Z")).toBe("2026-11-11");
  });
  it("uses UTC+2 in summer", () => {
    expect(parisDay("2026-07-31T22:30:00Z")).toBe("2026-08-01");
    expect(parisDay("2026-07-31T21:59:00Z")).toBe("2026-07-31");
  });
  it("handles the clock change on Sunday 25 Oct 2026", () => {
    expect(parisDay("2026-10-24T22:30:00Z")).toBe("2026-10-25"); // still UTC+2
    expect(parisDay("2026-10-25T23:30:00Z")).toBe("2026-10-26"); // now UTC+1
    expect(parisDay("2026-10-25T22:30:00Z")).toBe("2026-10-25"); // 23:30 Paris
  });
});

describe("what the money was spent on", () => {
  it("groups the purposes we write", () => {
    expect(groupPurpose("chat")).toBe("chat");
    expect(groupPurpose("embed_search")).toBe("search");
    expect(groupPurpose("embed_library")).toBe("indexing");
  });
  it("puts demos, the plain embed default and anything new under other", () => {
    for (const p of ["first_call", "memory_demo", "embed", "guardrails_demo", "something_new", ""]) expect(groupPurpose(p)).toBe("other");
  });
  it("has one colour token per group", () => {
    expect(GROUPS.map((g) => g.key)).toEqual(["chat", "search", "indexing", "other"]);
    expect(new Set(GROUPS.map((g) => g.color)).size).toBe(4);
  });
});

describe("totals for today, this week and this month", () => {
  const rows = [
    row("2026-11-12T09:00:00Z", 0.01), // today
    row("2026-11-09T09:00:00Z", 0.02), // Monday, this week
    row("2026-11-08T20:00:00Z", 0.04), // Sunday, last week, same month
    row("2026-10-31T09:00:00Z", 0.08), // last month
  ];
  it("counts each receipt in the right windows", () => {
    expect(totals(rows, TODAY)).toEqual({ today: 0.01, week: 0.03, month: 0.07 });
  });
  it("starts the week on Monday, not Sunday", () => {
    expect(totals([row("2026-11-08T12:00:00Z", 1)], TODAY).week).toBe(0);
    expect(totals([row("2026-11-09T00:30:00Z", 1)], TODAY).week).toBe(1);
  });
  it("uses the Paris midnight for the month boundary", () => {
    // 23:30 UTC on 31 Oct is already 1 Nov in Paris (UTC+1)
    expect(totals([row("2026-10-31T23:30:00Z", 0.5)], TODAY).month).toBe(0.5);
    expect(totals([row("2026-10-31T22:30:00Z", 0.5)], TODAY).month).toBe(0);
  });
  it("ignores receipts after today", () => {
    expect(totals([row("2026-11-13T09:00:00Z", 1)], TODAY)).toEqual({ today: 0, week: 0, month: 0 });
  });
  it("adds cents exactly", () => {
    expect(totals([row("2026-11-12T09:00:00Z", 0.1), row("2026-11-12T10:00:00Z", 0.2)], TODAY).today).toBe(0.3);
  });
  it("adds many six decimal receipts without drift", () => {
    const many = Array.from({ length: 10 }, (_, i) => row(`2026-11-12T09:0${i}:00Z`, 0.000123));
    expect(totals(many, TODAY).today).toBe(0.00123);
    const odd = Array.from({ length: 7 }, (_, i) => row(`2026-11-12T09:0${i}:00Z`, "0.000047"));
    expect(totals(odd, TODAY).month).toBe(0.000329);
  });
  it("reads a cost that arrives as text, and treats junk as zero", () => {
    expect(totals([row("2026-11-12T09:00:00Z", "0.004500"), row("2026-11-12T10:00:00Z", "oops")], TODAY).today).toBe(0.0045);
  });
  it("is zero with no receipts", () => expect(totals([], TODAY)).toEqual({ today: 0, week: 0, month: 0 }));
});

describe("buckets", () => {
  it("fills every day of the last 30, oldest first, with zeros where nothing was spent", () => {
    const b = bucketCosts([row("2026-11-12T09:00:00Z", 0.02)], "day", TODAY);
    expect(b).toHaveLength(30);
    expect(b[0].key).toBe("2026-10-14");
    expect(b[29].key).toBe(TODAY);
    expect(b[29].total).toBe(0.02);
    expect(b.slice(0, 29).every((x) => x.total === 0 && x.calls === 0)).toBe(true);
  });
  it("makes 12 weeks that each start on a Monday, the last one holding today", () => {
    const keys = bucketKeys("week", TODAY);
    expect(keys).toHaveLength(12);
    expect(keys[11]).toBe("2026-11-09");
    expect(keys[0]).toBe("2026-08-24");
    for (const k of keys) expect(new Date(`${k}T00:00:00Z`).getUTCDay()).toBe(1);
  });
  it("adds a week's receipts into its Monday", () => {
    const b = bucketCosts([row("2026-11-08T20:00:00Z", 1), row("2026-11-09T09:00:00Z", 2), row("2026-11-12T09:00:00Z", 4)], "week", TODAY);
    expect(b[10].total).toBe(1); // week of 2 Nov holds the Sunday
    expect(b[11].total).toBe(6);
  });
  it("makes 6 months ending with this one, each on the first of the month", () => {
    expect(bucketKeys("month", TODAY)).toEqual(["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"]);
  });
  it("crosses a year end", () => {
    expect(bucketKeys("month", "2027-02-10")).toEqual(["2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"]);
  });
  it("puts a receipt from 23:30 UTC on 31 July into August", () => {
    const b = bucketCosts([row("2026-07-31T22:30:00Z", 3)], "month", TODAY);
    expect(b.find((x) => x.key === "2026-08-01")!.total).toBe(3);
    expect(b.find((x) => x.key === "2026-07-01")!.total).toBe(0);
  });
  it("ignores receipts older than the window", () => {
    expect(bucketCosts([row("2026-05-01T09:00:00Z", 9)], "month", TODAY).reduce((s, x) => s + x.total, 0)).toBe(0);
    expect(bucketCosts([row("2026-10-01T09:00:00Z", 9)], "day", TODAY).reduce((s, x) => s + x.total, 0)).toBe(0);
  });
  it("splits a bucket by purpose group and counts calls", () => {
    const b = bucketCosts([
      row("2026-11-12T09:00:00Z", 0.01),
      row("2026-11-12T09:01:00Z", 0.002, { purpose: "embed_search" }),
      row("2026-11-12T09:02:00Z", 0.0005, { purpose: "memory_demo" }),
    ], "day", TODAY)[29];
    expect(b.byGroup).toEqual({ chat: 0.01, search: 0.002, indexing: 0, other: 0.0005 });
    expect(b.total).toBe(0.0125);
    expect(b.calls).toBe(3);
  });
  it("labels buckets in plain words", () => {
    expect(bucketCosts([], "day", TODAY)[29].label).toBe("12 Nov");
    expect(bucketCosts([], "week", TODAY)[11].label).toBe("9 Nov");
    expect(bucketCosts([], "month", TODAY)[5].label).toBe("Nov 2026");
  });
});

describe("month forecast, always a range", () => {
  it("runs from what is spent to the pace so far", () => {
    expect(monthForecast(0.5, "2026-11-10")).toEqual({ low: 0.5, high: 1.5 }); // 0.5 / 10 days * 30 days
  });
  it("knows how long February is", () => {
    expect(monthForecast(1, "2028-02-10").high).toBeCloseTo(2.9, 10); // leap year: 29 days
    expect(monthForecast(1, "2027-02-10").high).toBeCloseTo(2.8, 10);
  });
  it("is zero to zero when nothing was spent", () => expect(monthForecast(0, "2026-11-01")).toEqual({ low: 0, high: 0 }));
  it("never has a high below the low", () => {
    const f = monthForecast(2, "2026-11-30");
    expect(f.high).toBeGreaterThanOrEqual(f.low);
  });
});

describe("tables", () => {
  const rows = [
    row("2026-11-12T09:00:00Z", 0.01, { input_tokens: 1000, output_tokens: 100 }),
    row("2026-11-12T09:01:00Z", 0.03, { input_tokens: 3000, output_tokens: 300 }),
    row("2026-11-12T09:02:00Z", 0.001, { purpose: "embed_search", model: "openai/text-embedding-3-small", input_tokens: 10, output_tokens: 0 }),
    row("2026-10-12T09:00:00Z", 5), // last month
  ];
  it("keeps only this month's receipts for the tables", () => expect(thisMonth(rows, TODAY)).toHaveLength(3));
  it("adds calls, tokens and cost per model, dearest first", () => {
    expect(breakdown(thisMonth(rows, TODAY), "model")).toEqual([
      { name: "openai/gpt-6-luna", calls: 2, inputTokens: 4000, outputTokens: 400, cost: 0.04 },
      { name: "openai/text-embedding-3-small", calls: 1, inputTokens: 10, outputTokens: 0, cost: 0.001 },
    ]);
  });
  it("does the same per purpose", () => {
    expect(breakdown(thisMonth(rows, TODAY), "purpose").map((b) => b.name)).toEqual(["chat", "embed_search"]);
  });
  it("averages only successful chat calls", () => {
    const mixed = [row("2026-11-12T09:00:00Z", 0.02), row("2026-11-12T09:01:00Z", 0.04), row("2026-11-12T09:02:00Z", 9, { ok: false, error: "x" }),
      row("2026-11-12T09:03:00Z", 7, { purpose: "embed_search" })];
    expect(averageChatCall(mixed)).toBeCloseTo(0.03, 10);
    expect(averageChatCall([])).toBeNull();
  });
});

describe("calls that did not go through", () => {
  it("counts each code and explains it in our own words", () => {
    const f = failures([
      row("2026-11-12T09:00:00Z", 0, { ok: false, error: "cap_reached" }),
      row("2026-11-12T09:01:00Z", 0, { ok: false, error: "cap_reached" }),
      row("2026-11-12T09:02:00Z", 0, { ok: false, error: "too_many_calls" }),
      row("2026-11-12T09:03:00Z", 0.01),
    ]);
    expect(f.map((x) => [x.code, x.count])).toEqual([["cap_reached", 2], ["too_many_calls", 1]]);
    expect(f[0].text).toMatch(/monthly cap was already reached/);
  });
  it("names an error code it does not know, without inventing a meaning", () => {
    expect(failures([row("2026-11-12T09:00:00Z", 0, { ok: false, error: "RateLimitError" })])[0].text).toBe("The model service reported an error (RateLimitError)");
  });
  it("never shows text that is not a plain code", () => {
    const f = failures([row("2026-11-12T09:00:00Z", 0, { ok: false, error: "my private ankle question <b>hi</b>" }), row("2026-11-12T09:01:00Z", 0, { ok: false, error: null })]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ code: "unknown", count: 2 });
    expect(JSON.stringify(f)).not.toContain("ankle");
  });
  it("is empty when everything worked", () => expect(failures([row("2026-11-12T09:00:00Z", 0.01)])).toEqual([]));
});

describe("small helpers", () => {
  it("reads the view from the address", () => {
    expect(parseCostView("week")).toBe("week");
    expect(parseCostView(["month", "day"])).toBe("month");
    for (const bad of [undefined, "", "year", "WEEK", ["x"]]) expect(parseCostView(bad as string)).toBe("day");
  });
  it("shows small amounts with three decimals and larger ones with two", () => {
    expect(formatUsd(0)).toBe("$0.000");
    expect(formatUsd(0.0432)).toBe("$0.043");
    expect(formatUsd(1)).toBe("$1.00");
    expect(formatUsd(12.4)).toBe("$12.40");
  });
  it("tells the loader where to start reading", () => {
    expect(lookbackStartDay(TODAY)).toBe("2026-06-01");
    expect(lookbackStartDay("2027-01-15")).toBe("2026-08-01");
  });
  it("builds the chart's table with a column per group", () => {
    const t = chartTable(bucketCosts([row("2026-11-12T09:00:00Z", 0.01)], "day", TODAY), "day");
    expect(t.columns).toEqual(["Day", "Chat", "Library search", "Library indexing", "Demos and tests", "Total", "Calls"]);
    expect(t.rows[29]).toEqual(["12 Nov", "$0.010", "$0.000", "$0.000", "$0.000", "$0.010", 1]);
    expect(chartTable([], "week").columns[0]).toBe("Week starting");
    expect(chartTable([], "month").columns[0]).toBe("Month");
  });
});
