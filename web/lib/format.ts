/** 2776 -> "46:16", 5086 -> "1:24:46" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Average pace as "5:47 /km". Returns "-" when there is no distance. */
export function formatPace(distanceKm: number, durationS: number): string {
  if (distanceKm <= 0 || durationS <= 0) return "-";
  const perKm = Math.round(durationS / distanceKm);
  const m = Math.floor(perKm / 60);
  const s = perKm % 60;
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

export function formatKm(km: number): string {
  return `${Number(km.toFixed(2))} km`;
}
