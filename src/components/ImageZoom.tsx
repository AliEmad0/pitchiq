"use client";

import { type ReactNode, useState } from "react";

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";

/**
 * Wraps a small image (a player photo, a club crest, a stadium shot, …) so
 * clicking it opens a lightbox with the image shown BIG — the point is to see
 * the detail. `children` is the thumbnail rendered in place; `src` is the same
 * image shown large in the dialog.
 *
 * The dialog grows up to the viewport (`max-w-[92vw]` / `max-h-[86vh]`) and the
 * image keeps its natural aspect ratio (`object-contain`, `h/w-auto`), so a wide
 * stadium photo fills the width and a square crest stays square — never the old
 * fixed 320px square that shrank + letterboxed everything. A plain `<img>` is
 * used deliberately: `next/image`'s `fill` needs a fixed-aspect box, which is
 * exactly what made the enlarged image small.
 *
 * TASK-M90 — `src` accepts a CANDIDATE LIST, and the lightbox walks it on error
 * exactly like `<PlayerImage>` does for the thumbnail. Before this it took a
 * single string and rendered a bare `<img>` with no `onError`, so on a hero the
 * two disagreed: the thumbnail recovered from a 404 and the lightbox behind it
 * showed a broken box (Oliver Glasner, Andoni Iraola — both PL-CDN candidates
 * 404). Passing `resolvePlayerPhotoSrc(...)` was never enough: it returns
 * `candidates[0]`, which for a numeric id is the PL-CDN URL whether or not it
 * 404s, so no fallback was reachable from here.
 *
 * Two deliberate degradations, both preferring "no zoom" over "broken box":
 *  - **No usable candidate at all** → render `children` bare, with no trigger.
 *    A monogram has nothing to enlarge, so offering a lightbox is a lie.
 *  - **Every candidate failed while open** → swap the image for the alt text
 *    rather than leaving a broken-image icon filling the dialog.
 */
export function ImageZoom({
  src,
  alt,
  children,
  triggerClassName,
}: {
  /**
   * The image, or an ordered candidate list tried until one loads. Pass the same
   * list the thumbnail uses (`playerPhotoCandidates(...)`) so the two agree.
   */
  src: string | readonly string[];
  alt: string;
  children: ReactNode;
  triggerClassName?: string;
}) {
  // Keyed by url (not a bare boolean) so each candidate falls through to the
  // next, mirroring <PlayerImage>'s `failed` set rather than inventing a second
  // pattern.
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  const candidates = (typeof src === "string" ? [src] : src).filter(Boolean);
  const current = candidates.find((c) => !failed.has(c));

  // Nothing enlargeable — render the thumbnail without wrapping it in a button,
  // so there is no cursor-zoom affordance and no empty dialog to open.
  if (candidates.length === 0) return <>{children}</>;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Enlarge image: ${alt}`}
          className={cn("block cursor-zoom-in", triggerClassName)}
        >
          {children}
        </button>
      </DialogTrigger>
      <DialogContent
        className="w-auto max-w-[92vw] p-2 sm:max-w-[92vw]"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        {current ? (
          /* eslint-disable-next-line @next/next/no-img-element -- lightbox: arbitrary-dimension image shown at natural size capped to the viewport */
          <img
            src={current}
            alt={alt}
            onError={() => setFailed((prev) => new Set(prev).add(current))}
            className="mx-auto block h-auto max-h-[86vh] w-auto max-w-full rounded-lg object-contain"
          />
        ) : (
          <p className="text-muted-foreground mx-auto px-6 py-10 text-center text-sm">{alt}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
