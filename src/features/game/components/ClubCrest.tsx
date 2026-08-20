"use client";
import { useState } from "react";
import { clubLogo } from "@/utils/club-logo";

/**
 * A club's crest (owner, 2026-08-20) — the setup picker, the live scoreboard and the
 * full-time screen all name a club, and a name alone reads like a database row.
 *
 * ⚠️ The CURRENT crest, deliberately. `clubLogo` resolves a season-accurate variant only
 * when handed the historical ranges from `club-logos.json`; with none it returns
 * `/logos/<teamId>.png`. A Legacy XI spans thirty years, so there is no one season to be
 * accurate to — and the crest here identifies the club, it does not date the squad.
 *
 * ⛔ A plain `<img>`, not `next/image`. These are 51 committed files under `public/`, all
 * of them tiny, and every one is already served straight from the CDN; routing them through
 * the optimiser would add a request per crest for no gain.
 *
 * ⚠️ `alt=""` and `aria-hidden`. The club's NAME is always rendered beside it, so an
 * alt text would make a screen reader announce the same club twice.
 */
export function ClubCrest({
  teamId,
  size = 26,
  className,
}: {
  /** Null when the club is unknown — renders nothing rather than a broken image. */
  teamId: number | null | undefined;
  size?: number;
  className?: string;
}) {
  /**
   * ⛔ A failed crest renders NOTHING, never a broken-image glyph.
   *
   * `/logos/<id>.png` covers all 51 Premier League clubs today, but the pool is keyed on
   * whatever the data carries — an id with no file must degrade to the bare name, which is
   * exactly what the screen showed before crests existed.
   */
  const [failed, setFailed] = useState(false);
  if (teamId == null || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={clubLogo(teamId, 0)}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={className}
      style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }}
    />
  );
}
