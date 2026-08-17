import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localizeDigits } from "@/utils/format";

export interface ModeChoice {
  id: number;
  name: string;
  seasons: number;
}

/**
 * TASK-1810 — the club menu for a rule pack that needs a choice before drafting.
 *
 * ⚠️ A SERVER component rendering LINKS, not a client-side filter.
 *
 * Filtering an array was right while one page held every club's cards. With a club's
 * COMPLETE history the pool is ~900 cards, so all 51 clubs on one page would be ~6.7 MB.
 * Making the club a route segment means this page ships 51 names while each club's page
 * ships only its own cards — and this menu costs no JavaScript at all.
 */
export async function ModeChooser({ mode, choices }: { mode: string; choices: ModeChoice[] }) {
  const t = await getTranslations("game");
  const locale = await getLocale();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("legacyTitle")}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{t("legacyPick")}</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {choices.map((c) => (
          <li key={c.id}>
            <Link
              href={`/game/${mode}/${c.id}`}
              className="border-border hover:bg-muted flex w-full items-baseline justify-between rounded-lg border px-4 py-3 text-start"
            >
              {/* The club's name comes from the DATA — a literal here would ship English
                  into the Arabic UI and would trip the hardcoded-string guard. */}
              <span className="font-bold">{c.name}</span>
              <span className="text-muted-foreground font-mono text-xs">
                {t("legacySeasons", { count: localizeDigits(c.seasons, locale) })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
