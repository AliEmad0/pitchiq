import "server-only";
import sharp from "sharp";
import { playerPhotoCandidates } from "@/features/players/player-photo";

// Build-time only. The modern FPL photo URL 200-serves a *background* photo for
// older players (so the URL/format alone can't tell a transparent cutout from a
// photo-with-background). We inspect the actual pixels with sharp — a genuinely
// transparent image is a cutout, an opaque one is a background shot. Best-effort:
// any failure degrades to "photo", which every card family renders acceptably.

export type PhotoKind = "cutout" | "photo" | "none";
export interface ResolvedPhoto {
  kind: PhotoKind;
  url: string | null;
}

const cache = new Map<string, ResolvedPhoto>();

async function fetchBuffer(url: string, ms: number): Promise<Buffer | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolvePhoto(photo: string | null | undefined): Promise<ResolvedPhoto> {
  if (!photo) return { kind: "none", url: null };
  const hit = cache.get(photo);
  if (hit) return hit;

  const candidates = playerPhotoCandidates(photo);
  let result: ResolvedPhoto;
  if (candidates.length === 0) {
    result = { kind: "none", url: null };
  } else if (!/^\d+$/.test(photo)) {
    result = { kind: "photo", url: candidates[0]! }; // absolute URL → a background shot
  } else {
    const buf = await fetchBuffer(candidates[0]!, 4000);
    if (buf == null) {
      result = { kind: "photo", url: candidates[1] ?? candidates[0]! }; // 404 → legacy 250x250 (bg)
    } else {
      try {
        const { isOpaque } = await sharp(buf).stats();
        result = { kind: isOpaque ? "photo" : "cutout", url: candidates[0]! };
      } catch {
        result = { kind: "photo", url: candidates[0]! };
      }
    }
  }
  cache.set(photo, result);
  return result;
}

/** Resolve many photos with bounded concurrency (deduped via the shared cache). */
export async function resolvePhotos(
  photos: (string | null)[],
  concurrency = 12,
): Promise<ResolvedPhoto[]> {
  const out = new Array<ResolvedPhoto>(photos.length);
  let next = 0;
  const worker = async () => {
    while (next < photos.length) {
      const i = next++;
      out[i] = await resolvePhoto(photos[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, photos.length || 1) }, worker));
  return out;
}
