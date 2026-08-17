import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { clubLogo } from "@/utils/club-logo";
import { localizeDigits } from "@/utils/format";
import { currentDataSeason } from "@/utils/season";

export interface ModeChoice {
  id: number;
  name: string;
  seasons: number;
  first: number;
  last: number;
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
export async function ModeChooser({ mode, choices }: { mode: string; choices: ModeChoice[] }) {
  const t = await getTranslations("game");
  const locale = await getLocale();
  const season = currentDataSeason();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("legacyTitle")}</h1>
      <p className="text-muted-foreground mb-6 mt-1 text-sm">{t("legacyPick")}</p>

      <ul className="sticker-sheet bg-muted/40 border-border grid grid-cols-2 gap-3 rounded-lg border p-4 sm:grid-cols-3 lg:grid-cols-5">
        {choices.map((c, i) => (
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
                  `unoptimized` matches PlayerCard: these are already small local PNGs. */}
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
    </div>
  );
}
