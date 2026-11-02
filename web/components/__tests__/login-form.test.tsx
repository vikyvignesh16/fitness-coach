// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "../login-form";

vi.mock("@/app/login/actions", () => ({ login: vi.fn() }));

describe("LoginForm", () => {
  it("shows the email and password fields", () => {
    render(<LoginForm action={vi.fn(async () => ({ error: null }))} />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("shows the error message from a failed sign in", async () => {
    const action = vi.fn(async () => ({ error: "That email and password did not work." }));
    render(<LoginForm action={action} />);
    await userEvent.type(screen.getByLabelText("Email"), "me@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("did not work");
  });
});
