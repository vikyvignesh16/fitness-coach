// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CAR_PICTURE, HowToRead, READING_RULES, SAM_STORY } from "../insights/how-to-read";

describe("HowToRead", () => {
  it("starts closed so it does not crowd the page", () => {
    const { container } = render(<HowToRead />);
    expect(container.querySelector("details")).not.toHaveAttribute("open");
  });

  it("explains every metric that has a card at the top", () => {
    render(<HowToRead />);
    for (const name of ["Sleep", "Recovery", "Resting heart rate", "HRV", "Training load", "VO2max and threshold pace"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(CAR_PICTURE).toHaveLength(6);
  });

  it("has the rules, the story and the not-medical-advice line", () => {
    render(<HowToRead />);
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(READING_RULES.length + SAM_STORY.facts.length);
    expect(screen.getByText("Sam's Tuesday")).toBeInTheDocument();
    expect(screen.getByText(/not medical advice/i)).toBeInTheDocument();
  });

  it("never tells the reader the app changes their plan", () => {
    const text = JSON.stringify(SAM_STORY) + JSON.stringify(READING_RULES);
    expect(text).toContain("does not change the plan");
  });

  it("uses no dashes between words, as the project writing rule says", () => {
    const all = [...READING_RULES, ...CAR_PICTURE.flatMap((r) => [r.picture, r.meaning]), ...SAM_STORY.facts, ...SAM_STORY.reading, SAM_STORY.intro].join(" ");
    expect(all).not.toMatch(/ [-–—] /);
  });
});
