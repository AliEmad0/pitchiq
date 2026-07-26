import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ImageZoom } from "@/components/ImageZoom";
import { PlayerImage } from "@/features/players/components/PlayerImage";
import { PlayerRoleBlock } from "@/features/players/components/PlayerRoleBlock";
import { Flag } from "@/features/players/components/Flag";
import { PlayerAge } from "@/features/players/components/PlayerAge";
import { CaptainBadge } from "@/features/players/components/CaptainBadge";
import { resolvePlayerPhotoSrc } from "@/features/players/player-photo";
import type { PlayerProfile } from "@/features/players/api";
import { formatSeasonLabel, withSeason } from "@/utils/season";
import { formatBirthDate } from "@/utils/age";
import { revealProps } from "@/utils/reveal";

// Profile hero for `/players/[id]` (TASK-610 → TASK-1508 "magazine cover"
// redesign): a full-height cover photo panel on the left, the editorial
// identity block (eyebrow · name · position · bio · club) in the middle, and the
// compare CTA on the right. TASK-M15 added the nationality + age + DOB meta line.
export function PlayerHero({ player, season }: { player: PlayerProfile; season: number }) {
  const t = useTranslations("players");
  const tc = useTranslations("common");
  const locale = useLocale();
  // Click-to-enlarge the cover photo (only when there's a real image — the
  // initials monogram isn't worth zooming).
  const photoSrc = resolvePlayerPhotoSrc(player.photo);
  const cover = (
    <PlayerImage
      player={player}
      size="lg"
      deceased={!!player.dateOfDeath}
      className="size-full rounded-none object-cover object-top"
    />
  );
  return (
    <Card className="overflow-hidden p-0" {...revealProps()}>
      <div className="flex flex-col sm:flex-row">
        {/* Cover photo — full panel height on desktop, a banner on mobile. */}
        <div className="bg-muted relative h-56 w-full shrink-0 sm:h-auto sm:w-44 sm:self-stretch lg:w-56">
          {photoSrc ? (
            <ImageZoom src={photoSrc} alt={player.name} triggerClassName="size-full">
              {cover}
            </ImageZoom>
          ) : (
            cover
          )}
        </div>

        {/* Identity block. */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 p-5 sm:p-7">
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            {t("profileEyebrow", { season: formatSeasonLabel(season, locale) })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">{player.name}</h1>
            {player.isCaptain && <CaptainBadge className="size-6 text-xs" />}
          </div>
          {/* TASK-M70: enriched role block (mini-pitch + monogram + vitals);
              falls back to the plain coarse position for unenriched players. */}
          {player.role ? (
            <PlayerRoleBlock
              role={player.role}
              altRoles={player.altRoles}
              coarsePosition={player.position}
              foot={player.foot}
              height={player.height}
            />
          ) : (
            <p className="text-muted-foreground text-sm">{player.position}</p>
          )}
          {(player.nationalityCode ||
            player.nationality ||
            player.age !== null ||
            player.birthDate ||
            player.dateOfDeath) && (
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {player.nationalityCode && (
                <Flag code={player.nationalityCode} name={player.nationality} />
              )}
              {player.nationality && <span>{player.nationality}</span>}
              {player.age !== null && (
                <PlayerAge
                  age={player.age}
                  birthDate={player.birthDate}
                  dateOfDeath={player.dateOfDeath}
                  prefix={player.nationality ? t("agePrefixSep") : t("agePrefix")}
                />
              )}
              {player.birthDate && (
                <span>
                  · {tc("bornDate", { date: formatBirthDate(player.birthDate, locale) ?? "" })}
                </span>
              )}
              {player.dateOfDeath && (
                <span>
                  · {tc("diedDate", { date: formatBirthDate(player.dateOfDeath, locale) ?? "" })}
                </span>
              )}
            </p>
          )}
          <Link
            href={withSeason(`/teams/${player.team.id}`, season)}
            aria-label={tc("viewTeamPage", { team: player.team.name })}
            className="focus-visible:ring-ring mt-1 inline-flex items-center gap-2 rounded text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            <Image
              src={player.team.logo}
              alt=""
              width={24}
              height={24}
              className="size-6 shrink-0 object-contain"
              unoptimized
            />
            {player.team.name}
          </Link>
        </div>

        {/* Carry the viewed season as the slot-A season (`sa`, TASK-M24) so the
            comparison resolves this player against the season they were seen in.
            Without it, compare defaults to the current season, the slot hydrate
            404s for a historical player, and the self-heal effect clears the
            slot — the player would silently fail to pick. */}
        <div className="flex shrink-0 items-center justify-center p-5 sm:p-7 sm:ps-0">
          <Button asChild className="w-full sm:w-auto">
            <Link href={`/compare?a=${player.id}&sa=${season}`}>{t("compareWith")}</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
