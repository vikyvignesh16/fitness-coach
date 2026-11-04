import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isActiveTab, MENU_LINKS, TABS } from "../nav";

describe("isActiveTab", () => {
  it("lights Home only on the home page", () => {
    expect(isActiveTab("/", "/")).toBe(true);
    expect(isActiveTab("/runs", "/")).toBe(false);
  });

  it("keeps a tab lit on its own sub pages", () => {
    expect(isActiveTab("/runs", "/runs")).toBe(true);
    expect(isActiveTab("/runs/481362696762064996", "/runs")).toBe(true);
  });

  it("lights Runs on the calendar, which is another view of the runs", () => {
    expect(isActiveTab("/calendar", "/runs")).toBe(true);
    expect(isActiveTab("/calendar", "/")).toBe(false);
  });

  it("does not light a tab for a look-alike path", () => {
    expect(isActiveTab("/runsheet", "/runs")).toBe(false);
    expect(isActiveTab("/calendarx", "/runs")).toBe(false);
    expect(isActiveTab("/plan", "/runs")).toBe(false);
  });
});

describe("navigation points at real pages", () => {
  const appDir = path.resolve(__dirname, "../../app/(app)");
  const pageFor = (href: string) =>
    path.join(appDir, href === "/" ? "" : href, "page.tsx");

  it("has a page for every tab", () => {
    for (const t of TABS) expect(existsSync(pageFor(t.href)), t.href).toBe(true);
  });

  it("has a page for every menu link", () => {
    for (const l of MENU_LINKS) expect(existsSync(pageFor(l.href)), l.href).toBe(true);
  });

  it("keeps the bar to five tabs so it fits a phone", () => {
    expect(TABS).toHaveLength(5);
  });
});
