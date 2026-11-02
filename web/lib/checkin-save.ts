// The rules for saving a weekly check in. Checked on the server.
// The pain stop is worked out here from the answers. The browser cannot tell the server "no stop".
import { evaluatePain } from "./pain";

export const PHOTO_SLOTS = ["front", "side", "back"] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

/** Where a check in photo lives in the private photos bucket. The first folder is the user's id, which the storage rules check. */
export function photoPath(userId: string, weekStart: string, slot: PhotoSlot): string {
  return `${userId}/checkins/${weekStart}/${slot}.jpg`;
}

export type CheckinInput = {
  weightKg: string;
  heightCm: string;
  feeling: string;
  painScore: string;
  painRepeated: boolean;
  painLastedHours: string;
  painWorseNextMorning: boolean;
  flags: string[];
  /** Which photos were uploaded for this check in. The server works out the paths itself. */
  photos: Partial<Record<PhotoSlot, boolean>>;
};

export type CheckinRow = {
  week_start: string;
  morning_weight_kg: number;
  height_cm: number | null;
  feeling: string | null;
  pain_score: number;
  pain_repeated: boolean;
  pain_lasted_hours: number;
  pain_worse_next_morning: boolean;
  pain_flags: string[];
  pain_stop: boolean;
  pain_stop_message: string | null;
  photo_front?: string;
  photo_side?: string;
  photo_back?: string;
};

export interface CheckinDb {
  currentUserId(): Promise<string | null>;
  upsertCheckin(row: CheckinRow): Promise<void>;
}

export type CheckinResult =
  | { ok: true; stop: boolean; message: string | null }
  | { ok: false; error: string };

type Bounds = { min: number; max: number; integer: boolean; what: string };

function parseNumber(input: string, b: Bounds): { ok: true; value: number | null } | { ok: false; error: string } {
  const text = String(input ?? "").trim().replace(",", ".");
  if (text === "") return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, error: `${b.what} must be a number.` };
  const n = Number(text);
  if (b.integer && !Number.isInteger(n)) return { ok: false, error: `${b.what} must be a whole number.` };
  if (n < b.min || n > b.max) return { ok: false, error: `${b.what} must be between ${b.min} and ${b.max}.` };
  return { ok: true, value: Math.round(n * 10) / 10 };
}

const GENERIC = "Could not save. Try again.";
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export async function saveCheckin(db: CheckinDb, weekStart: string, input: CheckinInput): Promise<CheckinResult> {
  try {
    if (!isDate(weekStart)) return { ok: false, error: "That week is not valid." };

    const weight = parseNumber(input.weightKg, { min: 30, max: 250, integer: false, what: "Weight" });
    if (!weight.ok) return weight;
    if (weight.value === null) return { ok: false, error: "Enter your weight." };
    const height = parseNumber(input.heightCm, { min: 100, max: 250, integer: false, what: "Height" });
    if (!height.ok) return height;
    const score = parseNumber(input.painScore, { min: 0, max: 10, integer: true, what: "Pain score" });
    if (!score.ok) return score;
    const hours = parseNumber(input.painLastedHours, { min: 0, max: 336, integer: false, what: "Hours" });
    if (!hours.ok) return hours;

    const feeling = String(input.feeling ?? "").trim();
    if (feeling.length > 2000) return { ok: false, error: "Keep how you feel under 2000 characters." };

    const flags = Array.isArray(input.flags) ? input.flags.map(String) : [];
    let pain;
    try {
      pain = evaluatePain({
        score: score.value ?? 0,
        repeated: input.painRepeated === true,
        lastedHours: hours.value ?? 0,
        worseNextMorning: input.painWorseNextMorning === true,
        flags,
      });
    } catch {
      return { ok: false, error: "One of the pain answers is not recognised." };
    }

    const userId = await db.currentUserId();
    if (!userId) return { ok: false, error: "You are not signed in." };

    const row: CheckinRow = {
      week_start: weekStart,
      morning_weight_kg: weight.value,
      height_cm: height.value,
      feeling: feeling || null,
      pain_score: score.value ?? 0,
      pain_repeated: input.painRepeated === true,
      pain_lasted_hours: hours.value ?? 0,
      pain_worse_next_morning: input.painWorseNextMorning === true,
      pain_flags: [...new Set(flags)].sort(),
      pain_stop: pain.stop,
      pain_stop_message: pain.message,
    };
    // Only touch a photo column when a photo was uploaded this time, so editing a check in keeps earlier photos.
    for (const slot of PHOTO_SLOTS) {
      if (input.photos?.[slot] === true) row[`photo_${slot}`] = photoPath(userId, weekStart, slot);
    }

    await db.upsertCheckin(row);
    return { ok: true, stop: pain.stop, message: pain.message };
  } catch {
    return { ok: false, error: GENERIC }; // never show database errors
  }
}
