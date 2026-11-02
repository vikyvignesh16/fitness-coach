/** The size an image should be so its longest side is at most `maxEdge`. Never makes an image bigger. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export const MAX_EDGE = 1600; // pixels. Plenty to see a physique change, and keeps a photo to a few hundred KB
export const JPEG_QUALITY = 0.8;

/** Shrink a photo in the browser before uploading. A 6 MB phone photo becomes a few hundred KB. */
export async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file); // reads the phone's rotation info, so the photo stays upright
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the photo.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("Could not prepare the photo.");
  return blob;
}
