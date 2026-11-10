import { describe, expect, it } from "vitest";
import { HOW_TO } from "../insights-howto";

describe("how to read each chart", () => {
  it("has a guide for each chart, each with what to look at, a picture and Sam's example", () => {
    expect(Object.keys(HOW_TO).sort()).toEqual(["efficiency", "effort", "hrv", "load", "loadday", "loadhrv", "longrun", "marathon", "recovery", "rhr", "score", "sleep", "stress", "threshold", "vo2", "volume"]);
    for (const g of Object.values(HOW_TO)) {
      expect(g.look.length).toBeGreaterThan(40);
      expect(g.picture.length).toBeGreaterThan(40);
      expect(g.example).toMatch(/Sam/);
    }
  });

  it("uses no dashes between words, as the project writing rule says", () => {
    const all = Object.values(HOW_TO).flatMap((g) => [g.look, g.picture, g.example]).join(" ");
    expect(all).not.toMatch(/ [-–—] /);
  });

  it("never claims to diagnose or to change the plan", () => {
    const all = Object.values(HOW_TO).flatMap((g) => [g.look, g.picture, g.example]).join(" ").toLowerCase();
    expect(all).not.toMatch(/diagnos|you are ill|you have|change your plan/);
  });
});
