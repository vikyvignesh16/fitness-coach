import { formatPace } from "./insights-fitness";
import type { RunExtra } from "./types";

export type DetailRow = { label: string; value: string };

/** The rows for the "From your watch" card. A field COROS did not have is left out, never shown as zero. */
export function detailRows(x: RunExtra): DetailRow[] {
  const rows: DetailRow[] = [];
  const add = (label: string, value: string | null) => { if (value !== null) rows.push({ label, value }); };
  add("How it felt", x.perceived_effort);
  add("Training load", x.training_load === null ? null : String(x.training_load));
  add("Training effect", x.aerobic_te === null && x.anaerobic_te === null ? null
    : [x.aerobic_te !== null ? `aerobic ${x.aerobic_te.toFixed(1)}` : null, x.anaerobic_te !== null ? `anaerobic ${x.anaerobic_te.toFixed(1)}` : null].filter(Boolean).join(", "));
  add("Focus", x.training_focus);
  add("COROS says", x.performance);
  add("Best kilometre", x.best_km_pace_s === null ? null : `${formatPace(x.best_km_pace_s)} /km`);
  add("Cadence", x.cadence_spm === null ? null : `${x.cadence_spm} steps/min`);
  add("Stride length", x.stride_length_m === null ? null : `${x.stride_length_m.toFixed(2)} m`);
  add("Power", x.power_w === null ? null : `${x.power_w} W`);
  add("Climb", x.elevation_m === null ? null : `${x.elevation_m} m up${x.elev_loss_m !== null ? `, ${x.elev_loss_m} m down` : ""}`);
  return rows;
}

/** Your note, trimmed. Null when there is none. */
export function noteOf(x: RunExtra): string | null {
  const note = x.workout_note?.trim();
  return note ? note : null;
}
