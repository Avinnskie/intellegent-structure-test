/**
 * Storage abstraction for report files (T31, spec §5.5 portability).
 *
 * The interface is the contract the report service depends on; Supabase is one implementation.
 * `MemoryStorageProvider` exists so integration tests exercise the REAL service logic (versioning,
 * hashing, audit) without a network — the seam is here precisely so tests never mock the service.
 */
import { createClient } from "@supabase/supabase-js";
import { getServerConfig } from "../config.ts";

export type StorageProvider = {
  upload(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  createSignedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string>;
};

/** Supabase Storage against the PRIVATE buckets, using the server-only secret key. */
export function createSupabaseStorageProvider(): StorageProvider {
  const config = getServerConfig();
  const client = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });

  return {
    async upload(bucket, path, bytes, contentType) {
      const { error } = await client.storage.from(bucket).upload(path, bytes, {
        contentType,
        // Report files are immutable by design: a regenerate writes a NEW versioned path.
        upsert: false,
      });
      if (error) {
        throw new Error(`Gagal mengunggah berkas laporan: ${error.message}`);
      }
    },
    async createSignedUrl(bucket, path, expiresInSeconds) {
      const { data, error } = await client.storage
        .from(bucket)
        .createSignedUrl(path, expiresInSeconds);
      if (error || !data?.signedUrl) {
        throw new Error(`Gagal membuat tautan unduhan: ${error?.message ?? "tanpa URL"}`);
      }
      return data.signedUrl;
    },
  };
}

/** In-memory provider for tests. Enforces the same immutability as the real bucket. */
export function createMemoryStorageProvider(): StorageProvider & {
  files: Map<string, Uint8Array>;
} {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    upload(bucket, path, bytes) {
      const key = `${bucket}/${path}`;
      if (files.has(key)) {
        return Promise.reject(new Error(`Berkas ${key} sudah ada — laporan bersifat immutable.`));
      }
      files.set(key, bytes);
      return Promise.resolve();
    },
    createSignedUrl(bucket, path, expiresInSeconds) {
      const key = `${bucket}/${path}`;
      if (!files.has(key)) {
        return Promise.reject(new Error(`Berkas ${key} tidak ditemukan.`));
      }
      return Promise.resolve(`memory://signed/${key}?expires=${expiresInSeconds}`);
    },
  };
}
