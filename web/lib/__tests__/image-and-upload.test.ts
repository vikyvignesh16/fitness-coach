import { describe, expect, it, vi } from "vitest";
import { fitWithin } from "../image-resize";
import { uploadPhoto, type PhotoStorage } from "../photo-upload";

describe("fitWithin", () => {
  it("shrinks a big landscape photo so the long side is 1600", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it("shrinks a big portrait photo the same way", () => {
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("never makes a small photo bigger", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1000, 1600)).toEqual({ width: 1600, height: 1000 });
  });

  it("keeps the shape of the photo", () => {
    const { width, height } = fitWithin(4000, 3000, 1600);
    expect(width / height).toBeCloseTo(4 / 3, 2);
  });
});

describe("uploadPhoto", () => {
  const blob = new Blob(["x"], { type: "image/jpeg" });

  function fakeStorage(uploadError: { message: string } | null = null) {
    const calls: string[] = [];
    const storage: PhotoStorage = {
      remove: vi.fn(async () => { calls.push("remove"); return { error: null }; }),
      upload: vi.fn(async () => { calls.push("upload"); return { error: uploadError }; }),
    };
    return { storage, calls };
  }

  it("deletes any old photo first, then uploads, because overwriting is not allowed", async () => {
    const f = fakeStorage();
    await uploadPhoto(f.storage, "u/checkins/2026-11-02/front.jpg", blob);
    expect(f.calls).toEqual(["remove", "upload"]);
    expect(f.storage.upload).toHaveBeenCalledWith("u/checkins/2026-11-02/front.jpg", blob, { contentType: "image/jpeg" });
  });

  it("throws a plain message when the upload fails, without the storage error", async () => {
    const f = fakeStorage({ message: "new row violates row-level security policy for table objects" });
    await expect(uploadPhoto(f.storage, "p", blob)).rejects.toThrow("Could not upload a photo.");
    await expect(uploadPhoto(f.storage, "p", blob)).rejects.not.toThrow(/row-level/);
  });
});
