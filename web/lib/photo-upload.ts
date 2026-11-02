// The slice of Supabase storage we use, so it can be tested with a fake.
export interface PhotoStorage {
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
  upload(path: string, blob: Blob, options: { contentType: string }): Promise<{ error: { message: string } | null }>;
}

/**
 * Upload one photo to the private bucket. The storage rules allow upload, read and delete but not overwrite,
 * so a retaken photo is deleted first. Throws with a plain message if it fails.
 */
export async function uploadPhoto(storage: PhotoStorage, path: string, blob: Blob): Promise<void> {
  await storage.remove([path]); // fine if nothing is there yet
  const { error } = await storage.upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("Could not upload a photo.");
}
