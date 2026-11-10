// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StrengthSessionCard } from "../strength-session-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/gym/actions", () => ({ addExercisesAction: vi.fn(), addWorkoutAction: vi.fn(), deleteExerciseAction: vi.fn(), deleteWorkoutAction: vi.fn() }));
import type { StrengthSession } from "@/lib/types";

const base: StrengthSession = {
  id: "s1", source: "coros", coros_id: "c1", started_at: "2026-11-07T11:29:26Z", day: "2026-11-07", workout_name: "Shoulders and Core Version 1", duration_s: 4159,
  total_time_s: 5173, sets_count: 41, avg_hr: 110, calories: 482, training_load: 30, aerobic_te: 1.8, anaerobic_te: 0, training_focus: "Recovery",
  perceived_effort: "Easy", workout_note: "Felt good.\nShoulders strong.", sets: [
    { source: "coros", position: 1, exercise: "Seated Dumbbell Press", reps: 12, weight_kg: 16, seconds: 40, avg_hr: 92, max_hr: 100 },
    { source: "coros", position: 2, exercise: "Seated Dumbbell Press", reps: 12, weight_kg: 16, seconds: 40, avg_hr: 92, max_hr: 100 },
    { source: "coros", position: 3, exercise: "Crunch", reps: 15, weight_kg: null, seconds: 30, avg_hr: null, max_hr: null },
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

  it("every session offers to add an exercise, and a watch session cannot be removed", () => {
    render(<StrengthSessionCard session={base} />);
    expect(screen.getByRole("button", { name: "Add an exercise" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(screen.queryByText("Added by you")).toBeNull();
  });

  it("a session you typed in says so and can be removed as a whole", () => {
    render(<StrengthSessionCard session={{ ...base, source: "manual", coros_id: null, sets: base.sets.map((s) => ({ ...s, source: "manual" as const })) }} />);
    expect(screen.getByText("Added by you")).toBeInTheDocument();
    expect(screen.getByText("Typed in by you.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove this workout" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2); // one for each exercise
  });

  it("an exercise you added to a watch session is marked and can be removed, the watch's cannot", () => {
    const mine = { source: "manual" as const, position: 1, exercise: "Row", reps: 10, weight_kg: 30, seconds: null, avg_hr: null, max_hr: null };
    render(<StrengthSessionCard session={{ ...base, sets: [...base.sets, mine] }} />);
    expect(screen.getAllByText("Added by you")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Remove this workout" })).toBeNull();
  });
});
