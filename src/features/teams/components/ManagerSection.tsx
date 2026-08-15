import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { PlayerAge } from "@/features/players/components/PlayerAge";
import { PlayerImage } from "@/features/players/components/PlayerImage";
import type { ManagerProfile } from "@/features/teams/managers.api";
import { formatBirthDate } from "@/utils/age";
import { revealProps } from "@/utils/reveal";
import { withSeason } from "@/utils/season";

/**
 * The manager(s) who took charge of a club for the viewed season (TASK-M48) —
 * all of them, since a season can have several after a sacking (most matches
 * first). Each shows the official PL headshot + name + live age + DOB, and a
 * "Died" line + grayscale/mourning treatment when deceased (reusing the player
 * `<PlayerImage>` / `<PlayerAge>` primitives). Renders nothing for seasons with
 * no manager data (legacy 1992-2007).
 */
export function ManagerSection({
  managers,
  season,
}: {
  managers: ManagerProfile[];
  season: number;
}) {
  const t = useTranslations("teams");
  const tc = useTranslations("common");
  const locale = useLocale();
  if (managers.length === 0) return null;
  return (
    <section
      aria-label={t("managersAria")}
      className="rounded-lg border bg-card p-4 lg:p-6"
      {...revealProps()}
    >
      <h2 className="mb-3 text-sm font-semibold tracking-tight">
        {t("managersHeading", { count: managers.length })}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {managers.map((m) => (
          <li key={m.id} className="flex items-center gap-3">
            <PlayerImage
              player={{ name: m.name, photo: m.photo, photoFallback: m.photoFallback }}
              size="md"
              deceased={!!m.dateOfDeath}
              className="shrink-0 rounded-full"
            />
            <div className="min-w-0">
              <p className="truncate font-medium">
                <Link href={withSeason(`/managers/${m.id}`, season)} className="hover:underline">
                  {m.name}
                </Link>
              </p>
              <p className="text-muted-foreground text-xs">
                <PlayerAge
                  age={m.age}
                  birthDate={m.birthDate}
                  dateOfDeath={m.dateOfDeath}
                  prefix={t("agePrefix")}
                />
                {m.birthDate && (
                  <span>
                    {" "}
                    · {tc("bornDate", { date: formatBirthDate(m.birthDate, locale) ?? "" })}
                  </span>
                )}
                {m.dateOfDeath && (
                  <span>
                    {" "}
                    · {tc("diedDate", { date: formatBirthDate(m.dateOfDeath, locale) ?? "" })}
                  </span>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
