// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExerciseCard } from "../exercise-card";
import { buildSetRows, type PlannedExercise } from "@/lib/gym";

vi.mock("@/app/(app)/gym/actions", () => ({ saveSetAction: vi.fn() }));

const press: PlannedExercise = { name: "Flat dumbbell press", sets: 4, reps: "12", rir: 2 };
const plank: PlannedExercise = { name: "Plank", sets: 2, reps: "60 sec", rir: null };

function setup(over: Partial<React.ComponentProps<typeof ExerciseCard>> = {}) {
  const save = vi.fn(async () => ({ ok: true as const }));
  const exercise = over.exercise ?? press;
  render(
    <ExerciseCard
      date="2026-11-09"
      exercise={exercise}
      initialRows={buildSetRows(exercise, [])}
      last={null}
      disabled={false}
      defaultOpen
      save={save}
      {...over}
    />,
  );
  return save;
}

describe("ExerciseCard", () => {
  it("shows the plan, one row per planned set and the progress", () => {
    setup();
    expect(screen.getByText("Plan 4 x 12, 2 reps left in the tank")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/weight in kilograms/)).toHaveLength(4);
    expect(screen.getByText("0/4")).toBeInTheDocument();
  });

  it("shows last time's weight", () => {
    setup({ last: { loadKg: 24, reps: 12, date: "2026-11-02" } });
    expect(screen.getByText("Last time: 24 kg x 12")).toBeInTheDocument();
  });

  it("saves a set when it is ticked, with what was typed", async () => {
    const save = setup();
    await userEvent.type(screen.getByLabelText("Set 1 reps"), "12");
    await userEvent.type(screen.getByLabelText("Set 1 weight in kilograms"), "22,5");
    await userEvent.click(screen.getByRole("button", { name: "Set 1 done" }));
    expect(save).toHaveBeenCalledWith({
      date: "2026-11-09", exercise: "Flat dumbbell press", setNo: 1, reps: "12", loadKg: "22,5", seconds: "", done: true,
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set 1 done" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1/4")).toBeInTheDocument();
  });

  it("marks the exercise Done when every planned set is ticked", async () => {
    setup();
    for (let n = 1; n <= 4; n++) await userEvent.click(screen.getByRole("button", { name: `Set ${n} done` }));
    expect(await screen.findByText("Done", { selector: "[data-slot=badge]" })).toBeInTheDocument();
    expect(screen.queryByText("4/4")).toBeNull();
  });

  it("unticks a set and saves that too", async () => {
    const save = setup();
    await userEvent.click(screen.getByRole("button", { name: "Set 1 done" }));
    await userEvent.click(screen.getByRole("button", { name: "Set 1 done" }));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ setNo: 1, done: false }));
  });

  it("shows the server's message and keeps what was typed when a save is refused", async () => {
    const save = vi.fn(async () => ({ ok: false as const, error: "Weight cannot be more than 500." }));
    setup({ save });
    await userEvent.type(screen.getByLabelText("Set 1 weight in kilograms"), "900");
    await userEvent.click(screen.getByRole("button", { name: "Set 1 done" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Weight cannot be more than 500.");
    expect(screen.getByLabelText("Set 1 weight in kilograms")).toHaveValue("900");
  });

  it("explains a lost signal and keeps what was typed", async () => {
    const save = vi.fn(async () => { throw new Error("network"); });
    setup({ save });
    await userEvent.type(screen.getByLabelText("Set 1 reps"), "12");
    await userEvent.click(screen.getByRole("button", { name: "Set 1 done" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Check your signal");
    expect(screen.getByLabelText("Set 1 reps")).toHaveValue("12");
  });

  it("adds a set", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Add set/ }));
    expect(screen.getByLabelText("Set 5 reps")).toBeInTheDocument();
  });

  it("shows a seconds box and no weight box for a timed hold", () => {
    setup({ exercise: plank, initialRows: buildSetRows(plank, []) });
    expect(screen.getAllByLabelText(/seconds/)).toHaveLength(2);
    expect(screen.queryByLabelText(/weight in kilograms/)).toBeNull();
  });

  it("cannot be used when the week is locked", async () => {
    const save = setup({ disabled: true });
    expect(screen.getByRole("button", { name: "Set 1 done" })).toBeDisabled();
    expect(screen.getByLabelText("Set 1 reps")).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });

  it("does not save a typed value until it is ticked", async () => {
    const save = setup();
    await userEvent.type(screen.getByLabelText("Set 1 reps"), "12");
    await userEvent.tab();
    await waitFor(() => expect(save).not.toHaveBeenCalled());
  });
});
