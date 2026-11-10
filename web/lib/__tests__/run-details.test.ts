import { describe, expect, it } from "vitest";
import { detailRows, noteOf } from "../run-details";
import type { RunExtra } from "../types";

const none: RunExtra = {
  training_load: null, aerobic_te: null, anaerobic_te: null, training_focus: null, performance: null, perceived_effort: null,
  workout_note: null, cadence_spm: null, stride_length_m: null, power_w: null, elevation_m: null, elev_loss_m: null, best_km_pace_s: null, detail_fetched_at: null,
};

describe("detailRows", () => {
  it("formats every field COROS gave", () => {
    const rows = detailRows({ ...none, perceived_effort: "Very Easy", training_load: 242, aerobic_te: 4, anaerobic_te: 0.1, training_focus: "Base",
      performance: "Below Average", best_km_pace_s: 335, cadence_spm: 157, stride_length_m: 1.05, power_w: 226, elevation_m: 104, elev_loss_m: 109 });
    expect(Object.fromEntries(rows.map((r) => [r.label, r.value]))).toEqual({
      "How it felt": "Very Easy", "Training load": "242", "Training effect": "aerobic 4.0, anaerobic 0.1", Focus: "Base", "COROS says": "Below Average",
      "Best kilometre": "5:35 /km", Cadence: "157 steps/min", "Stride length": "1.05 m", Power: "226 W", Climb: "104 m up, 109 m down",
    });
  });

  it("leaves out what COROS did not have, and never shows zero for it", () => {
    expect(detailRows(none)).toEqual([]);
    const rows = detailRows({ ...none, training_load: 80 });
    expect(rows).toEqual([{ label: "Training load", value: "80" }]);
  });

  it("a real zero is shown as a zero", () => {
    expect(detailRows({ ...none, anaerobic_te: 0 }).find((r) => r.label === "Training effect")?.value).toBe("anaerobic 0.0");
  });

  it("shows climb with no loss figure", () => {
    expect(detailRows({ ...none, elevation_m: 30 }).find((r) => r.label === "Climb")?.value).toBe("30 m up");
  });
});

describe("noteOf", () => {
  it("trims your note and treats an empty one as no note", () => {
    expect(noteOf({ ...none, workout_note: "  felt fine \n" })).toBe("felt fine");
    expect(noteOf({ ...none, workout_note: "   " })).toBeNull();
    expect(noteOf(none)).toBeNull();
  });
});
