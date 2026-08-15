import { useLocale, useTranslations } from "next-intl";
import { Trophy } from "lucide-react";

import { Card } from "@/components/ui/card";
import { ImageZoom } from "@/components/ImageZoom";
import { Flag } from "@/features/players/components/Flag";
import { PlayerAge } from "@/features/players/components/PlayerAge";
import { PlayerImage } from "@/features/players/components/PlayerImage";
import { resolvePlayerPhotoSrc } from "@/features/players/player-photo";
import type { ManagerProfile } from "@/features/managers/manager-profile.api";
import { formatBirthDate } from "@/utils/age";
import { localizeDigits } from "@/utils/format";
import { revealProps } from "@/utils/reveal";

/**
 * Manager profile hero (TASK-M49 → TASK-1510 "magazine cover" redesign): a
 * full-height cover headshot panel (grayscale + mourning ribbon when deceased,
 * via `<PlayerImage>`; click-to-enlarge via `<ImageZoom>`) + an editorial
 * identity block — eyebrow, name, nationality flag + name, live age, DOB, a
 * "Died" line, and a PL-titles badge.
 */
export function ManagerHero({ profile }: { profile: ManagerProfile }) {
  const t = useTranslations("managers");
  const tc = useTranslations("common");
  const locale = useLocale();
  // TASK-M87: the zoom target gains the crawled portrait as a last resort. For a
  // numeric id this is unchanged (the PL-CDN URL is still candidate one, 404 or
  // not — `<ImageZoom>` has no failover); it matters for legacy `lm-*` managers,
  // whose id yields no candidate at all, so the hero had no zoom before.
  const photoSrc = resolvePlayerPhotoSrc(profile.photo, profile.photoFallback);
  const titles = profile.honours.length;
  const cover = (
    <PlayerImage
      player={{ name: profile.name, photo: profile.photo, photoFallback: profile.photoFallback }}
      size="lg"
      deceased={!!profile.dateOfDeath}
      className="size-full rounded-none object-cover object-top"
    />
  );
  return (
    <Card className="overflow-hidden p-0" {...revealProps()}>
      <div className="flex flex-col sm:flex-row">
        <div className="bg-muted relative h-56 w-full shrink-0 sm:h-auto sm:w-44 sm:self-stretch lg:w-52">
          {photoSrc ? (
            <ImageZoom src={photoSrc} alt={profile.name} triggerClassName="size-full">
              {cover}
            </ImageZoom>
          ) : (
            cover
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 p-5 sm:p-7">
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            {t("profileEyebrow")}
          </p>
          <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">{profile.name}</h1>
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {profile.nationalityCode && (
              <span className="flex items-center gap-1.5">
                <Flag code={profile.nationalityCode} name={profile.nationality} />
                {profile.nationality}
              </span>
            )}
            <PlayerAge
              age={profile.age}
              birthDate={profile.birthDate}
              dateOfDeath={profile.dateOfDeath}
              prefix={profile.nationalityCode ? t("agePrefixSep") : t("agePrefix")}
            />
            {profile.birthDate && (
              <span>
                · {tc("bornDate", { date: formatBirthDate(profile.birthDate, locale) ?? "" })}
              </span>
            )}
            {profile.dateOfDeath && (
              <span>
                · {tc("diedDate", { date: formatBirthDate(profile.dateOfDeath, locale) ?? "" })}
              </span>
            )}
          </p>
          {titles > 0 && (
            <span className="bg-primary text-primary-foreground mt-1 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
              <Trophy className="size-3.5" aria-hidden />
              {t("titlesBadge", { count: titles, countFmt: localizeDigits(titles, locale) })}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
