import { describe, expect, it } from "vitest";
import { isPublicPath } from "../auth-paths";

describe("isPublicPath", () => {
  it("lets signed out visitors reach the login page only", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/plan")).toBe(false);
    expect(isPublicPath("/gates/ankle")).toBe(false);
  });

  it("does not treat look-alike paths as public", () => {
    expect(isPublicPath("/login-secret")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });
});
