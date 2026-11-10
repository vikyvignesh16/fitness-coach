// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AddExerciseForm, AddWorkoutForm, EntryEditor, RemoveExerciseButton, RemoveWorkoutButton } from "../strength-entry";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/gym/actions", () => ({ addExercisesAction: vi.fn(), addWorkoutAction: vi.fn(), deleteExerciseAction: vi.fn(), deleteWorkoutAction: vi.fn() }));

const ID = "3f2c1b9e-8a41-4d5e-9c7a-0b6e5d4c3a21";
const ok = () => vi.fn(async () => ({ ok: true as const }));
const fail = (error = "Line 1: nope") => vi.fn(async () => ({ ok: false as const, error }));

function Editor() {
  const [v, setV] = useState("");
  return <EntryEditor value={v} onChange={setV} />;
}

describe("EntryEditor", () => {
  it("shows what it understood as one tag per set, before anything is saved", async () => {
    render(<Editor />);
    await userEvent.type(screen.getByRole("textbox"), "Bench press, 2 x 8 at 40 kg");
    const preview = screen.getByLabelText("What will be saved");
    expect(preview).toHaveTextContent("Bench press");
    expect(screen.getAllByLabelText(/^Set \d: 8 reps at 40 kg$/)).toHaveLength(2);
  });

  it("says which line is wrong and why", async () => {
    render(<Editor />);
    await userEvent.type(screen.getByRole("textbox"), "Bench press, lots");
    expect(screen.getByRole("alert")).toHaveTextContent(/Line 1: I could not read/);
  });

  it("stays quiet until you type something", () => {
    render(<Editor />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("AddExerciseForm", () => {
  it("opens, saves exactly what you typed for that session, then closes and refreshes", async () => {
    const add = ok();
    render(<AddExerciseForm sessionId={ID} add={add} />);
    await userEvent.click(screen.getByRole("button", { name: "Add an exercise" }));
    await userEvent.type(screen.getByRole("textbox"), "Row, 3 x 10 at 30");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(add).toHaveBeenCalledWith(ID, "Row, 3 x 10 at 30"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add an exercise" })).toBeInTheDocument());
    expect(refresh).toHaveBeenCalled();
  });

  it("cannot be saved while empty or while a line is wrong", async () => {
    const add = ok();
    render(<AddExerciseForm sessionId={ID} add={add} />);
    await userEvent.click(screen.getByRole("button", { name: "Add an exercise" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox"), "nonsense");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(add).not.toHaveBeenCalled();
  });

  it("keeps what you typed and shows the message when saving fails", async () => {
    const add = fail("Not saved. Check your signal and try again.");
    render(<AddExerciseForm sessionId={ID} add={add} />);
    await userEvent.click(screen.getByRole("button", { name: "Add an exercise" }));
    await userEvent.type(screen.getByRole("textbox"), "Row, 3 x 10");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Not saved. Check your signal and try again.")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Row, 3 x 10");
  });

  it("shows a friendly message if the request itself throws", async () => {
    const add = vi.fn(async () => { throw new Error("secret network detail"); });
    render(<AddExerciseForm sessionId={ID} add={add} />);
    await userEvent.click(screen.getByRole("button", { name: "Add an exercise" }));
    await userEvent.type(screen.getByRole("textbox"), "Row, 3 x 10");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Not saved/)).toBeInTheDocument();
    expect(screen.queryByText(/secret/)).toBeNull();
  });

  it("Cancel closes it without saving", async () => {
    const add = ok();
    render(<AddExerciseForm sessionId={ID} add={add} />);
    await userEvent.click(screen.getByRole("button", { name: "Add an exercise" }));
    await userEvent.type(screen.getByRole("textbox"), "Row, 3 x 10");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Add an exercise" })).toBeInTheDocument();
    expect(add).not.toHaveBeenCalled();
  });
});

describe("AddWorkoutForm", () => {
  it("starts on today, cannot choose a future day, and saves the day, details and exercises together", async () => {
    const add = ok();
    const { container } = render(<AddWorkoutForm today="2026-11-10" add={add} />);
    await userEvent.click(screen.getByRole("button", { name: "Add a workout" }));
    const date = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(date).toHaveValue("2026-11-10");
    expect(date).toHaveAttribute("max", "2026-11-10");
    await userEvent.type(screen.getByPlaceholderText("Push day"), "Push day");
    await userEvent.type(screen.getByPlaceholderText("55"), "55");
    await userEvent.type(screen.getByLabelText(/One exercise per line/), "Bench press, 4 x 8 at 40");
    await userEvent.click(screen.getByRole("button", { name: "Save workout" }));
    await waitFor(() => expect(add).toHaveBeenCalledWith({ date: "2026-11-10", name: "Push day", minutes: "55", note: "", text: "Bench press, 4 x 8 at 40" }));
  });

  it("cannot be saved without an exercise", async () => {
    render(<AddWorkoutForm today="2026-11-10" add={ok()} />);
    await userEvent.click(screen.getByRole("button", { name: "Add a workout" }));
    expect(screen.getByRole("button", { name: "Save workout" })).toBeDisabled();
  });

  it("shows the message when saving is refused", async () => {
    render(<AddWorkoutForm today="2026-11-10" add={fail("A workout cannot be in the future.")} />);
    await userEvent.click(screen.getByRole("button", { name: "Add a workout" }));
    await userEvent.type(screen.getByLabelText(/One exercise per line/), "Row, 3 x 10");
    await userEvent.click(screen.getByRole("button", { name: "Save workout" }));
    expect(await screen.findByText("A workout cannot be in the future.")).toBeInTheDocument();
  });
});

describe("removing", () => {
  it("takes two taps, and nothing is removed after the first", async () => {
    const remove = ok();
    render(<RemoveExerciseButton sessionId={ID} positions={[1, 2, 3]} remove={remove} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Yes, remove it" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(ID, [1, 2, 3]));
  });

  it("Keep it backs out without removing", async () => {
    const remove = ok();
    render(<RemoveWorkoutButton sessionId={ID} remove={remove} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove this workout" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remove this workout" })).toBeInTheDocument();
  });

  it("says so when it could not remove", async () => {
    render(<RemoveWorkoutButton sessionId={ID} remove={fail("Not saved. Check your signal and try again.")} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove this workout" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, remove the workout" }));
    expect(await screen.findByText(/Not saved/)).toBeInTheDocument();
  });
});
