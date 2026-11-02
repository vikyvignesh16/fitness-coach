// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CheckinForm, type CheckinInitial } from "../checkin-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/checkin/actions", () => ({ saveCheckinAction: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: vi.fn() }));

const USER = "11111111-2222-3333-4444-555555555555";
const initial: CheckinInitial = {
  weightKg: "", heightCm: "174", feeling: "", painScore: 0, painRepeated: false,
  painLastedHours: "", painWorseNextMorning: false, flags: [],
};

type Deps = NonNullable<React.ComponentProps<typeof CheckinForm>["deps"]>;

function setup(over: Partial<Deps> = {}) {
  const save: Deps["save"] = over.save ?? vi.fn(async () => ({ ok: true as const, stop: false, message: null }));
  const upload: Deps["upload"] = over.upload ?? vi.fn(async () => undefined);
  const shrink: Deps["shrink"] = over.shrink ?? vi.fn(async () => new Blob(["small"]));
  render(<CheckinForm userId={USER} weekStart="2026-11-02" initial={initial} savedPhotos={{}} deps={{ save, upload, shrink }} />);
  return { save, upload, shrink };
}

describe("CheckinForm", () => {
  it("offers the last height and asks for weight", () => {
    setup();
    expect(screen.getByLabelText("Height (cm)")).toHaveValue("174");
    expect(screen.getByLabelText("Morning weight (kg)")).toHaveValue("");
  });

  it("sends the answers when saved", async () => {
    const { save } = setup();
    await userEvent.type(screen.getByLabelText("Morning weight (kg)"), "77,5");
    await userEvent.type(screen.getByLabelText("How do you feel?"), "Fine");
    await userEvent.click(screen.getByRole("button", { name: "Save check in" }));
    expect(save).toHaveBeenCalledWith({
      weightKg: "77,5", heightCm: "174", feeling: "Fine", painScore: "0", painRepeated: false,
      painLastedHours: "0", painWorseNextMorning: false, flags: [], photos: {},
    });
    expect(await screen.findByText("Check in saved")).toBeInTheDocument();
  });

  it("asks the extra pain questions only from a score of 3", async () => {
    setup();
    expect(screen.queryByLabelText("How many hours did it last?")).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: "2" }));
    expect(screen.queryByLabelText("How many hours did it last?")).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: "3" }));
    expect(screen.getByLabelText("How many hours did it last?")).toBeInTheDocument();
  });

  it("does not send the extra pain answers when the score is under 3", async () => {
    const { save } = setup();
    await userEvent.type(screen.getByLabelText("Morning weight (kg)"), "77");
    await userEvent.click(screen.getByRole("radio", { name: "5" }));
    await userEvent.click(screen.getByLabelText("The pain was 3 or more more than once"));
    await userEvent.type(screen.getByLabelText("How many hours did it last?"), "30");
    await userEvent.click(screen.getByRole("radio", { name: "1" })); // back down to 1
    await userEvent.click(screen.getByRole("button", { name: "Save check in" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ painScore: "1", painRepeated: false, painLastedHours: "0" }));
  });

  it("sends the serious flags", async () => {
    const { save } = setup();
    await userEvent.type(screen.getByLabelText("Morning weight (kg)"), "77");
    await userEvent.click(screen.getByLabelText("Swelling"));
    await userEvent.click(screen.getByRole("button", { name: "Save check in" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ flags: ["swelling"] }));
  });

  it("shows a stop, with the advice to see a professional, when the server says stop", async () => {
    const save = vi.fn(async () => ({ ok: true as const, stop: true, message: "Stop: swelling. See a sports physio or clinician before resuming." }));
    setup({ save });
    await userEvent.type(screen.getByLabelText("Morning weight (kg)"), "77");
    await userEvent.click(screen.getByRole("button", { name: "Save check in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("sports physio or clinician");
  });

  it("uploads a chosen photo, shrunk, to the user's own folder before saving", async () => {
    const order: string[] = [];
    const shrink = vi.fn(async () => { order.push("shrink"); return new Blob(["small"]); });
    const upload = vi.fn(async () => { order.push("upload"); });
    const save = vi.fn(async () => { order.push("save"); return { ok: true as const, stop: false, message: null }; });
    setup({ save, upload, shrink });
    await userEvent.type(screen.getByLabelText("Morning weight (kg)"), "77");
    await userEvent.upload(screen.getByLabelText("Front"), new File(["big"], "me.jpg", { type: "image/jpeg" }));
    await userEvent.click(screen.getByRole("button", { name: "Save check in" }));
    expect(order).toEqual(["shrink", "upload", "save"]);
    expect(upload).toHaveBeenCalledWith(`${USER}/checkins/2026-11-02/front.jpg`, expect.any(Blob));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ photos: { front: true } }));
  });

  it("saves nothing when a photo fails to upload", async () => {
    const upload = vi.fn(async () => { throw new Error("Could not upload a photo."); });
    const { save } = setup({ upload });
    await userEvent.type(screen.getByLabelText("Morning weight (kg)"), "77");
    await userEvent.upload(screen.getByLabelText("Side"), new File(["big"], "me.jpg", { type: "image/jpeg" }));
    await userEvent.click(screen.getByRole("button", { name: "Save check in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nothing was saved");
    expect(save).not.toHaveBeenCalled();
  });

  it("shows the server's message and keeps what was typed when it refuses", async () => {
    const save = vi.fn(async () => ({ ok: false as const, error: "Weight must be between 30 and 250." }));
    setup({ save });
    await userEvent.type(screen.getByLabelText("Morning weight (kg)"), "999");
    await userEvent.click(screen.getByRole("button", { name: "Save check in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("between 30 and 250");
    expect(screen.getByLabelText("Morning weight (kg)")).toHaveValue("999");
  });
});
