// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StrengthSessionCard } from "../strength-session-card";
import type { StrengthSession } from "@/lib/types";

const base: StrengthSession = {
  id: "s1", coros_id: "c1", started_at: "2026-11-07T11:29:26Z", day: "2026-11-07", workout_name: "Shoulders and Core Version 1", duration_s: 4159,
  total_time_s: 5173, sets_count: 41, avg_hr: 110, calories: 482, training_load: 30, aerobic_te: 1.8, anaerobic_te: 0, training_focus: "Recovery",
  perceived_effort: "Easy", workout_note: "Felt good.\nShoulders strong.", sets: [
    { position: 1, exercise: "Seated Dumbbell Press", reps: 12, weight_kg: 16, seconds: 40, avg_hr: 92, max_hr: 100 },
    { position: 2, exercise: "Seated Dumbbell Press", reps: 12, weight_kg: 16, seconds: 40, avg_hr: 92, max_hr: 100 },
    { position: 3, exercise: "Crunch", reps: 15, weight_kg: null, seconds: 30, avg_hr: null, max_hr: null },
  ],
};

describe("StrengthSessionCard", () => {
  it("shows the name, the numbers, your note and each exercise with its sets", () => {
    render(<StrengthSessionCard session={base} />);
    expect(screen.getByText("Shoulders and Core Version 1")).toBeInTheDocument();
    expect(screen.getByText("1h 09m")).toBeInTheDocument();
    expect(screen.getByText("384 kg")).toBeInTheDocument(); // 12 x 16 x 2, in the numbers at the top
    expect(screen.getByText("Easy")).toBeInTheDocument();
    expect(screen.getByText(/Felt good\./).className).toMatch(/whitespace-pre-line/);
    expect(screen.getByText("Seated Dumbbell Press")).toBeInTheDocument();
    expect(screen.getAllByText("12 × 16 kg")).toHaveLength(2); // each set is its own tag
    expect(screen.getByText("15 reps")).toBeInTheDocument();
    expect(screen.getByText("2 sets · 384 kg lifted")).toBeInTheDocument();
    expect(screen.getByLabelText("Set 2: 12 reps at 16 kg")).toBeInTheDocument();
  });

  it("counts the sets it shows, not the larger number COROS counts for warm up and rests", () => {
    render(<StrengthSessionCard session={base} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("41")).toBeNull();
  });

  it("an older session with no exercise detail says so, and shows COROS's own set count", () => {
    render(<StrengthSessionCard session={{ ...base, sets: [], workout_name: null, workout_note: null }} />);
    expect(screen.getByText("Strength session")).toBeInTheDocument();
    expect(screen.getByText("No exercise detail was recorded for this session.")).toBeInTheDocument();
    expect(screen.getByText("41")).toBeInTheDocument();
    expect(screen.queryByText("Your note")).toBeNull();
  });

  it("leaves out numbers COROS did not give, and never shows zero for them", () => {
    render(<StrengthSessionCard session={{ ...base, avg_hr: null, calories: null, training_load: null, perceived_effort: null, training_focus: null, sets: [] }} />);
    expect(screen.queryByText("Heart rate")).toBeNull();
    expect(screen.queryByText("Training load")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
  });
});
