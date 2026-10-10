import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateToken } from "./crypto";
import { ValidationError } from "./errors";

/**
 * File storage behind an interface. Local disk in development; swap for S3 /
 * R2 / GCS in production without touching callers. Keys are always prefixed
 * with the tenant id so reads can be authorised per restaurant.
 */
export interface StorageProvider {
  put(restaurantId: string, file: { name: string; type: string; bytes: Buffer }): Promise<{ key: string; url: string }>;
  get(key: string): Promise<{ bytes: Buffer; type: string } | null>;
}

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const TYPE_BY_EXT: Record<string, string> = Object.fromEntries(Object.entries(ALLOWED).map(([t, e]) => [e, t]));

class LocalDiskStorage implements StorageProvider {
  // Uploaded files are runtime data, not code — keep them out of build tracing.
  private root = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./storage");

  async put(restaurantId: string, file: { name: string; type: string; bytes: Buffer }) {
    const ext = ALLOWED[file.type];
    if (!ext) throw new ValidationError("Upload a JPG, PNG, WebP or PDF file");
    if (file.bytes.length > MAX_UPLOAD_BYTES) throw new ValidationError("Files must be 5 MB or smaller");
    const month = new Date().toISOString().slice(0, 7);
    const key = `${restaurantId}/${month}/${generateToken(12)}.${ext}`;
    const full = path.join(this.root, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, file.bytes);
    return { key, url: `/api/v1/files/${key}` };
  }

  async get(key: string) {
    if (!/^[\w-]+\/\d{4}-\d{2}\/[\w-]+\.(jpg|png|webp|pdf)$/.test(key)) return null;
    try {
      const bytes = await readFile(path.join(this.root, key));
      return { bytes, type: TYPE_BY_EXT[key.split(".").pop()!] ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }
}

export const storage: StorageProvider = new LocalDiskStorage();
