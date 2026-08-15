"use client";

import { useState } from "react";
import Image from "next/image";

import { cn } from "@/utils/cn";
import { playerInitials, playerPhotoCandidates } from "@/features/players/player-photo";

// Re-export the pure helpers (they moved to `player-photo.ts` so Server
// Components can call them — see that file) for existing consumers + tests.
export {
  playerInitials,
  playerPhotoCandidates,
  resolvePlayerPhotoSrc,
} from "@/features/players/player-photo";

/**
 * One avatar component for every player surface — squad grid, compare slot
 * pickers, search results, leaderboards. It owns the source-resolution chain so
 * no consumer has to know how a `photo` value maps to an image:
 *
 *   1. **Photo asset code** (numeric string, e.g. `"223340"`, written by TASK-602)
 *      → hot-link to the Premier League CDN.
 *   2. **Absolute URL** (starts with `http(s)://`, e.g. a committed portrait URL)
 *      → used as-is.
 *   3. **Anything else** — `""`, `null`, a non-numeric/non-URL string → render a
 *      deterministic initials monogram (no broken-image icon).
 *
 * For an FPL code there are TWO candidate PL CDN URLs (TASK-M28f): the **current**
 * path `…/premierleague25/photos/players/110x140/{code}.png` (the PL migrated here
 * — it resolves the codes the old path 404s, e.g. Alisson/Salah) and the **legacy**
 * `…/premierleague/photos/players/250x250/p{code}.png` as a fallback. The component
 * tries them in order; if every candidate fails to load (a genuinely-missing photo,
 * a moved Commons file) the `onError` handler swaps to the initials monogram so a
 * broken-image box is **never** shown (TASK-M28). This is why it's a client component.
 *
 * Replaces the ad-hoc `<Image src={photo}>` + initials blocks that used to live
 * in each consumer. Those broke the moment TASK-602 turned `photo` into a bare
 * FPL code (`<img src="223340">` resolves to a 404), which is what motivated
 * consolidating the logic here.
 */

export type PlayerImageSize = "sm" | "md" | "lg";

// `next/image` wants intrinsic width/height; the `size-*` class sets the
// rendered box. Consumers can override the box via `className` (tailwind-merge
// lets a passed `size-full` / `size-7` win over these defaults).
const SIZE_PX: Record<PlayerImageSize, number> = { sm: 32, md: 48, lg: 120 };
const SIZE_CLASS: Record<PlayerImageSize, string> = {
  sm: "size-8",
  md: "size-12",
  lg: "size-[7.5rem]",
};
const TEXT_CLASS: Record<PlayerImageSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-2xl",
};

export type PlayerImageInput = {
  name: string;
  photo: string | null;
  /**
   * TASK-M87 — a last-resort absolute URL tried only after every `photo`
   * candidate has failed. Managers pass the crawled Transfermarkt portrait here
   * so it fills a genuine hole without displacing a working PL-CDN headshot.
   */
  photoFallback?: string | null;
} | null;

export type PlayerImageProps = {
  player: PlayerImageInput;
  size?: PlayerImageSize;
  className?: string;
  /**
   * TASK-M40: when the player is deceased, render the avatar in grayscale with a
   * black mourning ribbon in the top-left corner (the image is kept, just
   * filtered). Applied wherever the avatar shows (squad card + player page).
   */
  deceased?: boolean;
};

export function PlayerImage({ player, size = "md", className, deceased }: PlayerImageProps) {
  // Track the srcs that failed to load (keyed by url, not a bare boolean) so that
  // a candidate falls through to the next, and a `player` photo change retries.
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const src = playerPhotoCandidates(player?.photo, player?.photoFallback).find(
    (c) => !failed.has(c),
  );

  // When deceased, sizing + the caller's className move to a positioned wrapper
  // (which holds the mourning ribbon); the avatar fills it and is grayscaled.
  const avatarClass = deceased
    ? cn("size-full object-cover grayscale", src ? "" : "flex items-center justify-center")
    : cn("shrink-0 object-cover", SIZE_CLASS[size], className);

  const avatar = src ? (
    <Image
      src={src}
      // Decorative: every consumer renders the player's name as adjacent
      // text, so an empty alt avoids a duplicate screen-reader announcement.
      alt=""
      width={SIZE_PX[size]}
      height={SIZE_PX[size]}
      // The PL CDN is a remote host; skip Next's optimizer (it would proxy +
      // re-encode every avatar). Matches what the consumers did before.
      unoptimized
      // On failure, mark this src failed → fall to the next candidate (legacy
      // CDN), then to initials. Never shows a broken-image box.
      onError={() => setFailed((prev) => new Set(prev).add(src))}
      className={avatarClass}
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        "bg-muted text-muted-foreground flex shrink-0 items-center justify-center font-semibold",
        deceased ? "size-full grayscale" : cn("shrink-0", SIZE_CLASS[size], className),
        TEXT_CLASS[size],
      )}
    >
      {playerInitials(player?.name ?? "")}
    </span>
  );

  if (!deceased) return avatar;

  return (
    <span
      className={cn("relative inline-flex shrink-0 overflow-hidden", SIZE_CLASS[size], className)}
    >
      {avatar}
      {/* Mourning ribbon: a black corner triangle, scaled to the avatar. */}
      <span
        aria-hidden
        data-testid="mourning-ribbon"
        className="pointer-events-none absolute top-0 left-0 h-2/5 w-2/5 bg-black"
        style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
      />
    </span>
  );
}
