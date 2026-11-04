// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoachingNotesCard } from "../coaching-notes";

describe("CoachingNotesCard", () => {
  it("shows each note with its heading", () => {
    render(<CoachingNotesCard notes={{ before: "Warm up easy.", stop_or_modify: "Stop for sharp pain." }} />);
    expect(screen.getByText("Before")).toBeInTheDocument();
    expect(screen.getByText("Warm up easy.")).toBeInTheDocument();
    expect(screen.getByText("Stop or change the plan if")).toBeInTheDocument();
    expect(screen.queryByText("During")).not.toBeInTheDocument();
  });

  it("shows nothing for a plan without notes, like v5.1", () => {
    const { container } = render(<CoachingNotesCard notes={null} />);
    expect(container).toBeEmptyDOMElement();
    const blank = render(<CoachingNotesCard notes={{ before: "  " }} />);
    expect(blank.container).toBeEmptyDOMElement();
  });
});
