/**
 * Local-device media uploads for content (tutorial videos, question images), stored in the
 * PRIVATE media bucket. Nothing here is ever public: every read goes through a short-lived signed
 * URL minted server-side for an authorized surface (portal preview, or the participant pages
 * that legitimately render the content).
 */
import { z } from "zod";
import { ApiError } from "../api/errors.ts";
import { getServerConfig } from "../config.ts";
import type { DbLike } from "../db/client.ts";
import type { StorageProvider } from "../providers/storage.ts";
import type { AuthContext } from "./authz.ts";
import { writeAudit } from "./audit.ts";

export const MEDIA_KINDS = {
  "tutorial-video": {
    maxBytes: 100 * 1024 * 1024,
    // MIME allow-list, matched exactly — the content type is what the signed URL will serve back.
    mimeToExt: { "video/mp4": "mp4", "video/webm": "webm" } as Record<string, string>,
    label: "video tutorial",
  },
  "tutorial-image": {
    maxBytes: 5 * 1024 * 1024,
    mimeToExt: {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    } as Record<string, string>,
    label: "gambar tutorial",
  },
  "item-image": {
    maxBytes: 5 * 1024 * 1024,
    mimeToExt: {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    } as Record<string, string>,
    label: "gambar soal",
  },
} as const;

export type MediaKind = keyof typeof MEDIA_KINDS;

export const mediaKindSchema = z.enum(["tutorial-video", "tutorial-image", "item-image"]);

const MEDIA_PREFIX = "media/";
/** Long enough for the longest subtest sitting; short enough that a leaked URL goes stale. */
const PARTICIPANT_URL_TTL_SECONDS = 2 * 60 * 60;
const PREVIEW_URL_TTL_SECONDS = 300;

export type UploadedMediaDto = { path: string; kind: MediaKind; bytes: number };

export async function uploadMedia(
  db: DbLike,
  storage: StorageProvider,
  ctx: AuthContext,
  kind: MediaKind,
  file: File,
): Promise<UploadedMediaDto> {
  const spec = MEDIA_KINDS[kind];
  const ext = spec.mimeToExt[file.type];
  if (!ext) {
    throw new ApiError(
      "UNSUPPORTED_MEDIA_TYPE",
      `Tipe berkas ${file.type || "tidak dikenal"} tidak didukung untuk ${spec.label}.`,
      422,
    );
  }
  if (file.size === 0 || file.size > spec.maxBytes) {
    throw new ApiError(
      "MEDIA_TOO_LARGE",
      `Ukuran ${spec.label} maksimal ${Math.round(spec.maxBytes / 1024 / 1024)} MB.`,
      422,
    );
  }

  // Server-generated name: the client's filename never reaches the bucket (no traversal, no
  // collisions, nothing to sanitize).
  const path = `${MEDIA_PREFIX}${kind}/${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await storage.upload(getServerConfig().SUPABASE_MEDIA_BUCKET, path, bytes, file.type);

  await writeAudit(db, {
    organizationId: ctx.organizationId,
    actorType: "user",
    actorId: ctx.userId,
    action: "media.uploaded",
    objectType: "media",
    objectId: path,
    metadata: { kind, bytes: file.size, contentType: file.type },
  });

  return { path, kind, bytes: file.size };
}

/**
 * Signed URL for a stored media path. The `media/` prefix check is the authorization boundary on
 * the PATH: this helper can never be talked into signing a report or anything else in the bucket
 * namespace, whoever calls it.
 */
export async function signMediaUrl(
  storage: StorageProvider,
  path: string,
  audience: "participant" | "preview",
): Promise<string> {
  if (!path.startsWith(MEDIA_PREFIX) || path.includes("..")) {
    throw new ApiError("NOT_FOUND", "Data tidak ditemukan.", 404);
  }
  return storage.createSignedUrl(
    getServerConfig().SUPABASE_MEDIA_BUCKET,
    path,
    audience === "participant" ? PARTICIPANT_URL_TTL_SECONDS : PREVIEW_URL_TTL_SECONDS,
  );
}

/**
 * Fail-soft variant for participant pages: a missing file or a storage hiccup must degrade to
 * "no media shown", never to a broken test page.
 */
export async function signMediaUrlOrNull(
  storage: StorageProvider,
  path: string | null,
  audience: "participant" | "preview",
): Promise<string | null> {
  if (!path) {
    return null;
  }
  try {
    return await signMediaUrl(storage, path, audience);
  } catch {
    return null;
  }
}
