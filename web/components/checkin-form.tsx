"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveCheckinAction } from "@/app/(app)/checkin/actions";
import { StatusBanner } from "@/components/status-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PHOTO_SLOTS, photoPath, type CheckinResult, type PhotoSlot } from "@/lib/checkin-save";
import { shrinkImage } from "@/lib/image-resize";
import { FLAG_LABELS, PAIN_STOP_SCORE, SERIOUS_FLAGS } from "@/lib/pain";
import { uploadPhoto } from "@/lib/photo-upload";
import { createClient } from "@/lib/supabase/browser";

export type CheckinInitial = {
  weightKg: string;
  heightCm: string;
  feeling: string;
  painScore: number;
  painRepeated: boolean;
  painLastedHours: string;
  painWorseNextMorning: boolean;
  flags: string[];
};

type Deps = {
  save: typeof saveCheckinAction;
  shrink: (file: File) => Promise<Blob>;
  upload: (path: string, blob: Blob) => Promise<void>;
};

const defaultDeps: Deps = {
  save: saveCheckinAction,
  shrink: shrinkImage,
  upload: (path, blob) => uploadPhoto(createClient().storage.from("photos"), path, blob),
};

const SLOT_LABEL: Record<PhotoSlot, string> = { front: "Front", side: "Side", back: "Back" };

export function CheckinForm({
  userId,
  weekStart,
  initial,
  savedPhotos,
  deps = defaultDeps,
}: {
  userId: string;
  weekStart: string;
  initial: CheckinInitial;
  savedPhotos: Partial<Record<PhotoSlot, string>>;
  deps?: Deps;
}) {
  const router = useRouter();
  const [weight, setWeight] = useState(initial.weightKg);
  const [height, setHeight] = useState(initial.heightCm);
  const [feeling, setFeeling] = useState(initial.feeling);
  const [score, setScore] = useState(initial.painScore);
  const [repeated, setRepeated] = useState(initial.painRepeated);
  const [hours, setHours] = useState(initial.painLastedHours);
  const [worse, setWorse] = useState(initial.painWorseNextMorning);
  const [flags, setFlags] = useState<string[]>(initial.flags);
  const [files, setFiles] = useState<Partial<Record<PhotoSlot, File>>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<CheckinResult, { ok: true }> | null>(null);

  const showPainDetail = score >= PAIN_STOP_SCORE;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);
    try {
      // Photos first. If one fails nothing is saved, so the check in never points at a missing photo.
      const photos: Partial<Record<PhotoSlot, boolean>> = {};
      for (const slot of PHOTO_SLOTS) {
        const file = files[slot];
        if (!file) continue;
        await deps.upload(photoPath(userId, weekStart, slot), await deps.shrink(file));
        photos[slot] = true;
      }
      const saved = await deps.save({
        weightKg: weight,
        heightCm: height,
        feeling,
        painScore: String(score),
        painRepeated: showPainDetail && repeated,
        painLastedHours: showPainDetail ? hours || "0" : "0",
        painWorseNextMorning: worse,
        flags,
        photos,
      });
      if (saved.ok) {
        setResult(saved);
        setFiles({});
        router.refresh();
      } else {
        setError(saved.error);
      }
    } catch {
      setError("A photo could not be uploaded, or the signal dropped. Nothing was saved. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="weight">Morning weight (kg)</Label>
          <Input id="weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="height">Height (cm)</Label>
          <Input id="height" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="feeling">How do you feel?</Label>
        <textarea
          id="feeling"
          value={feeling}
          onChange={(e) => setFeeling(e.target.value)}
          rows={3}
          maxLength={2000}
          className="border-input bg-background w-full rounded-lg border px-3 py-2 text-base"
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Worst pain this week, 0 is none and 10 is the worst</legend>
        <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Pain score">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={score === n}
              onClick={() => setScore(n)}
              className={`min-h-11 rounded-lg border text-base tabular-nums ${score === n ? "bg-foreground text-background font-semibold" : ""}`}
            >
              {n}
            </button>
          ))}
        </div>

        {showPainDetail && (
          <div className="space-y-3 text-sm">
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" checked={repeated} onChange={(e) => setRepeated(e.target.checked)} className="size-5" />
              The pain was 3 or more more than once
            </label>
            <div className="space-y-2">
              <Label htmlFor="hours">How many hours did it last?</Label>
              <Input id="hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
          </div>
        )}

        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={worse} onChange={(e) => setWorse(e.target.checked)} className="size-5" />
          The first steps were worse the next morning
        </label>

        <div className="space-y-1 text-sm">
          <p className="font-medium">Any of these?</p>
          {SERIOUS_FLAGS.map((f) => (
            <label key={f} className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={flags.includes(f)}
                onChange={(e) => setFlags((fs) => (e.target.checked ? [...fs, f] : fs.filter((x) => x !== f)))}
                className="size-5"
              />
              {FLAG_LABELS[f]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Photos</legend>
        <p className="text-muted-foreground text-sm">Private. Shrunk on your phone before they upload.</p>
        <div className="grid grid-cols-3 gap-3">
          {PHOTO_SLOTS.map((slot) => (
            <div key={slot} className="space-y-1">
              <Label htmlFor={`photo-${slot}`} className="text-xs">{SLOT_LABEL[slot]}</Label>
              {savedPhotos[slot] && !files[slot] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={savedPhotos[slot]} alt={`${SLOT_LABEL[slot]} photo from this week`} className="aspect-[3/4] w-full rounded-lg object-cover" />
              )}
              <input
                id={`photo-${slot}`}
                type="file"
                accept="image/*"
                className="w-full text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setFiles((fs) => ({ ...fs, [slot]: file }));
                }}
              />
            </div>
          ))}
        </div>
      </fieldset>

      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      {result && (
        <div className="space-y-3">
          <StatusBanner level="good" title="Check in saved" />
          {result.stop && result.message && <StatusBanner level="stop" title="Pain stop">{result.message}</StatusBanner>}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Saving..." : "Save check in"}</Button>
    </form>
  );
}
