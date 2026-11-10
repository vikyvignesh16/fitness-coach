// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RunDetailsCard } from "../run-details-card";
import type { RunExtra } from "@/lib/types";

const none: RunExtra = {
  training_load: null, aerobic_te: null, anaerobic_te: null, training_focus: null, performance: null, perceived_effort: null,
  workout_note: null, cadence_spm: null, stride_length_m: null, power_w: null, elevation_m: null, elev_loss_m: null, best_km_pace_s: null, detail_fetched_at: null,
};

describe("RunDetailsCard", () => {
  it("shows the numbers and your note, keeping line breaks", () => {
    render(<RunDetailsCard extra={{ ...none, training_load: 242, perceived_effort: "Very Easy", workout_note: "Felt fine.\nLegs heavy." }} />);
    expect(screen.getByText("242")).toBeInTheDocument();
    expect(screen.getByText("Very Easy")).toBeInTheDocument();
    expect(screen.getByText("Your note")).toBeInTheDocument();
    expect(screen.getByText(/Felt fine\./).className).toMatch(/whitespace-pre-line/);
  });

  it("says nothing has arrived yet when there are no details, and does not invent a zero", () => {
    render(<RunDetailsCard extra={null} />);
    expect(screen.getByText(/Nothing has arrived for this run yet/)).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("a run with details but no note shows no note section", () => {
    render(<RunDetailsCard extra={{ ...none, training_load: 80 }} />);
    expect(screen.queryByText("Your note")).toBeNull();
  });
});
