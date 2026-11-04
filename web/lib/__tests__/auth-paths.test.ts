import { describe, expect, it } from "vitest";
import { isPublicPath } from "../auth-paths";

describe("isPublicPath", () => {
  it("lets signed out visitors reach the login page and the calendar link only", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/calendar/feed/abc.ics")).toBe(true);
    expect(isPublicPath("/calendar")).toBe(false); // the calendar page itself needs a login
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/plan")).toBe(false);
    expect(isPublicPath("/gates/ankle")).toBe(false);
  });

  it("does not treat look-alike paths as public", () => {
    expect(isPublicPath("/login-secret")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
    expect(isPublicPath("/calendar/feedback")).toBe(false);
  });
});
