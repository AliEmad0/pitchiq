import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { Link } from "@/i18n/navigation";
import { CaptainDeal } from "./CaptainDeal";
import { Flag } from "@/features/players/components/Flag";
import { continentOf, type Continent } from "@/features/game/domain/continents";
import { clubLogo } from "@/utils/club-logo";
import { countryNameFromCode } from "@/utils/country";
import { localizeDigits } from "@/utils/format";
import { currentDataSeason } from "@/utils/season";

export interface ModeChoice {
  id: number;
  name: string;
  seasons: number;
  first: number;
  last: number;
  /**
   * Captain's Draft only — the icon's REAL card (owner, 2026-08-25).
   *
   * ⚠️ One card per icon, ~23 KB across the sheet. A flag stood here first; the card is the
   * currency the rest of the game is played in, and it is the thing being chosen.
   */
  card?: EnrichedCard;
}

/**
 * What the sheet is choosing between.
 *
 * ⚠️ A prop, not a lookup on `mode`. This component must not learn which modes exist —
 * "modes are rule packs, not code paths", and the pack's own `chooser.kind` is what
 * decides. It changes the ICON and the COPY; the sticker-sheet treatment is shared,
 * because the owner picked it for the act of choosing rather than for clubs specifically.
 */
export type ChooserKind = "club" | "captain" | "nation";

/** A nation tile (TASK-1842): the flag-icons code and the distinct-player count — no name,
 *  which is derived from the code per locale so the menu carries no strings to go stale. */
export interface NationChoice {
  code: string;
  players: number;
}

/**
 * TASK-1810 — the club menu for a rule pack that needs a choice before drafting.
 *
 * Owner-picked treatment: **concept 09 "Sticker Album"** — a Panini sheet, every club a
 * sticker in a dashed slot, crest first. The arrival is **concept 06 "Foil Sweep"**: the
 * stickers settle, then a sheen crosses the sheet.
 *
 * ⚠️ A SERVER component rendering LINKS, not a client-side filter. Filtering an array was
 * right while one page held every club's cards; with a club's complete history the pool is
 * ~900 cards, so all 51 on one page would be ~6.7 MB. The club is a route segment, so this
 * page ships 51 names and costs no JavaScript at all — the whole treatment is CSS.
 */
export async function ModeChooser({
  mode,
  choices,
  nations,
  kind = "club",
}: {
  mode: string;
  choices?: ModeChoice[];
  /** Nation packs only — see `NationChoice`. */
  nations?: NationChoice[];
  kind?: ChooserKind;
}) {
  const t = await getTranslations("game");
  const locale = await getLocale();
  const season = currentDataSeason();

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* ⚠️ The way back out. This page is reached from the mode gate, but nothing on it
          returned there — the only exit was the browser's back button. */}
      <Link
        href="/game"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm font-semibold"
      >
        <span aria-hidden="true">←</span>
        {t("modeBackToHub")}
      </Link>

      <h1 className="text-2xl font-extrabold tracking-tight">
        {t(
          kind === "captain" ? "captainsTitle" : kind === "nation" ? "nationTitle" : "legacyTitle",
        )}
      </h1>
      <p className="text-muted-foreground mb-6 mt-1 text-sm">
        {t(kind === "captain" ? "captainsPick" : kind === "nation" ? "nationPick" : "legacyPick")}
      </p>

      {/* ⭐ A captain pack DEALS (owner, 2026-08-25) rather than laying out its whole
          roster: five face-down icons turned over, so the choice is luck like every other
          deal in the game. The sticker sheet stays for clubs, where picking your own club
          is the point and a random five would be absurd. */}
      {kind === "captain" ? (
        <CaptainDeal cards={(choices ?? []).map((c) => c.card!).filter(Boolean)} />
      ) : kind === "nation" ? (
        /**
         * TASK-1842 — the nation menu: the sticker-sheet treatment (shared with clubs — the
         * owner picked it for the ACT of choosing), grouped by continent so 57 tiles read as
         * six shelves rather than one wall. Flags lead the way crests do; the name is
         * derived per locale from the code, and the count is the honest signal of how much
         * of a draft will be the nation's own.
         */
        <div className="space-y-5">
          {(
            [
              ["eu", "continentEu"],
              ["af", "continentAf"],
              ["sa", "continentSa"],
              ["na", "continentNa"],
              ["as", "continentAs"],
              ["oc", "continentOc"],
            ] as Array<[Continent, string]>
          ).map(([cont, labelKey]) => {
            const group = (nations ?? []).filter((n) => continentOf(n.code) === cont);
            return group.length === 0 ? null : (
              <section key={cont} aria-label={t(labelKey)}>
                <h2 className="text-muted-foreground mb-2 font-mono text-[11px] font-bold tracking-widest uppercase">
                  {t(labelKey)}
                </h2>
                <ul className="sticker-sheet bg-muted/40 border-border grid grid-cols-2 gap-3 rounded-lg border p-4 sm:grid-cols-3 lg:grid-cols-5">
                  {group.map((n, i) => (
                    <li
                      key={n.code}
                      className="sticker-slot"
                      style={{ "--i": Math.min(i, 26) } as React.CSSProperties}
                    >
                      <Link
                        href={`/game/${mode}/${n.code}`}
                        data-testid="nation-tile"
                        className="border-border hover:border-primary hover:bg-muted/60 flex h-full flex-col items-center gap-2 rounded-md border-2 border-dashed p-3 text-center transition-colors"
                      >
                        <Flag
                          code={n.code}
                          name={countryNameFromCode(n.code, locale)}
                          className="text-[2rem] leading-none"
                        />
                        <span className="text-xs font-bold leading-tight">
                          {countryNameFromCode(n.code, locale) ?? n.code}
                        </span>
                        <span className="text-muted-foreground mt-auto font-mono text-[10px]">
                          {t("nationPlayers", { count: localizeDigits(n.players, locale) })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <ul className="sticker-sheet bg-muted/40 border-border grid grid-cols-2 gap-3 rounded-lg border p-4 sm:grid-cols-3 lg:grid-cols-5">
          {(choices ?? []).map((c, i) => (
            <li
              key={c.id}
              className="sticker-slot"
              // The arrival order. Capped so the last sticker on a 51-club sheet is not
              // still waiting a second and a half after the first.
              style={{ "--i": Math.min(i, 26) } as React.CSSProperties}
            >
              <Link
                href={`/game/${mode}/${c.id}`}
                className="border-border hover:border-primary hover:bg-muted/60 flex h-full flex-col items-center gap-2 rounded-md border-2 border-dashed p-3 text-center transition-colors"
              >
                {/* The crest leads — it is what a supporter recognises before the name.
                  `unoptimized` matches PlayerCard: these are already small local PNGs.
                  For an icon the FLAG stands in its place: a player has no crest, and his
                  nationality is half of what the mode drafts around. */}
                {/* The crest leads — it is what a supporter recognises before the name.
                  `unoptimized` matches PlayerCard: these are already small local PNGs.
                  ⚠️ Clubs only. A captain pack never reaches here — it deals five cards
                  above instead of laying out a sheet. */}
                <Image
                  src={clubLogo(c.id, season)}
                  alt=""
                  width={44}
                  height={44}
                  unoptimized
                  className="h-11 w-11 object-contain"
                />
                {/* The club's name comes from the DATA — a literal here would ship English
                  into the Arabic UI and would trip the hardcoded-string guard. */}
                <span className="text-xs font-bold leading-tight">{c.name}</span>
                <span className="text-muted-foreground mt-auto font-mono text-[10px]">
                  {/* ⚠️ Two keys, not ICU plural: the count is pre-formatted by
                    `localizeDigits` (Intl gives Arabic WESTERN digits), so it reaches the
                    catalog as a string and a `{count, plural, …}` rule would never match.
                    Three clubs served exactly one season, so "1 seasons" is on screen. */}
                  {t(c.seasons === 1 ? "legacySeason" : "legacySeasons", {
                    count: localizeDigits(c.seasons, locale),
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
