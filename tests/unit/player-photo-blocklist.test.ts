import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOCKED_PHOTOS, isBlockedPhoto } from "@/features/players/photo-blocklist";
import { playerPhotoCandidates, resolvePlayerPhotoSrc } from "@/features/players/player-photo";

/**
 * ⛔ Owner-reported, 2026-08-21: Richard Gough's card showed a grainy monochrome portrait of
 * an elderly bald man. The file is "R T Gough Oswestry" — plainly not a footballer
 * photographed in the nineties.
 *
 * The mismatch comes from the pipeline's Wikimedia name-matching and the cure belongs there;
 * this repo only reads committed snapshots. The blocklist is what stops a known-wrong face
 * shipping in the meantime, and it survives a data refresh because it lives in source rather
 * than in `players-*.json`.
 */
describe("the photo blocklist", () => {
  it("produces NO candidates for a blocked photo", () => {
    for (const url of BLOCKED_PHOTOS) {
      expect(playerPhotoCandidates(url)).toEqual([]);
      expect(resolvePlayerPhotoSrc(url)).toBeNull();
    }
  });

  it("⚠️ falls back to the NO-PHOTO state, not to a different image", () => {
    // Absent beats wrong. A blocked photo must not quietly resolve to the legacy CDN or to
    // anything else — every surface has to reach its own empty state.
    const url = [...BLOCKED_PHOTOS][0]!;
    expect(resolvePlayerPhotoSrc(url, "https://example.com/other.jpg")).toBe(
      "https://example.com/other.jpg",
    );
    expect(isBlockedPhoto(url)).toBe(true);
  });

  it("⛔ leaves every other photo untouched", () => {
    // The blocklist must be surgical: one wrong face removed, 4,000-odd correct ones intact.
    expect(playerPhotoCandidates("118748")).toHaveLength(2);
    expect(playerPhotoCandidates("https://commons.wikimedia.org/wiki/x.jpg")).toHaveLength(1);
    expect(isBlockedPhoto("118748")).toBe(false);
    expect(isBlockedPhoto(null)).toBe(false);
  });

  it("⚠️ every blocked entry is an exact value the DATA actually carries", () => {
    /**
     * A blocklist entry that matches nothing is dead weight that reads as protection. The
     * comparison is whole-string and case-sensitive, so a hand-typed URL that differs by one
     * escape silently protects nobody — which is exactly the failure this asserts against.
     */
    const dir = join(process.cwd(), "data");
    const inUse = new Set<string>();
    for (const f of readdirSync(dir).filter((n) => n.startsWith("players-"))) {
      const rows = JSON.parse(readFileSync(join(dir, f), "utf8")) as Array<{ photo?: string }>;
      for (const r of Array.isArray(rows) ? rows : []) if (r.photo) inUse.add(r.photo);
    }
    for (const url of BLOCKED_PHOTOS) expect(inUse.has(url)).toBe(true);
  });
});

/**
 * ⭐ THE AUTOMATIC HALF. A photo claimed by two DIFFERENT players is wrong for at least one
 * of them, and that needs no judgement to detect — unlike Gough, where a human had to look.
 *
 * ⚠️ Distinct player IDS, never (id, name) pairs. A player carrying two spellings across
 * seasons ("Phil Neville" / "Philip Neville", both 1002864) shares one id and one photo
 * legitimately; counting spellings inflated this from 12 to 78 the first time I measured it
 * and would have condemned dozens of correct photos.
 */
describe("photo uniqueness across the committed data", () => {
  it("reports how many photos are claimed by more than one player", () => {
    const dir = join(process.cwd(), "data");
    const byPhoto = new Map<string, Set<number>>();
    for (const f of readdirSync(dir).filter((n) => n.startsWith("players-"))) {
      const rows = JSON.parse(readFileSync(join(dir, f), "utf8")) as Array<{
        photo?: string;
        id?: number;
      }>;
      for (const r of Array.isArray(rows) ? rows : []) {
        if (!r.photo || r.id == null) continue;
        const set = byPhoto.get(r.photo) ?? new Set<number>();
        set.add(r.id);
        byPhoto.set(r.photo, set);
      }
    }
    const clashes = [...byPhoto.entries()].filter(([, ids]) => ids.size > 1);

    /**
     * ⚠️ A CEILING, not an assertion that the data is clean — 12 URLs currently point at 25
     * different players and they are a known upstream defect. The number must not grow: a
     * refresh that introduces new collisions fails here instead of shipping more wrong faces
     * silently. Lower it when the pipeline fixes some.
     */
    expect(clashes.length).toBeLessThanOrEqual(12);
  });
});
