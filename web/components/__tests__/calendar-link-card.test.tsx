// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CalendarLinkCard } from "../calendar-link-card";

vi.mock("@/app/(app)/calendar/feed-actions", () => ({ createFeedLink: vi.fn() }));

const ok = () => vi.fn(async () => ({ url: "https://x.example/calendar/feed/TOKEN.ics", error: null }));

describe("CalendarLinkCard", () => {
  it("makes a first link and shows it with a warning that it is shown once", async () => {
    const create = ok();
    render(<CalendarLinkCard createdOn={null} create={create} />);
    await userEvent.click(screen.getByRole("button", { name: "Make my calendar link" }));
    await waitFor(() => expect((screen.getByLabelText("Calendar link") as HTMLInputElement).value).toContain("/calendar/feed/TOKEN.ics"));
    expect(screen.getByText(/shown once/)).toBeTruthy();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("asks for a second tap before replacing an existing link, and never shows the old one", async () => {
    const create = ok();
    render(<CalendarLinkCard createdOn="4 Nov" create={create} />);
    expect(screen.getByText(/made on 4 Nov/)).toBeTruthy();
    expect(screen.queryByLabelText("Calendar link")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Make a new link" }));
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/old link will stop working/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Tap again to replace the old link" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  });

  it("shows an error and no link when making it fails", async () => {
    const create = vi.fn(async () => ({ url: null, error: "Could not make the link. Try again." }));
    render(<CalendarLinkCard createdOn={null} create={create} />);
    await userEvent.click(screen.getByRole("button", { name: "Make my calendar link" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Could not make the link");
    expect(screen.queryByLabelText("Calendar link")).toBeNull();
  });
});
