"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CaptainBadge } from "@/features/players/components/CaptainBadge";
import { Flag } from "@/features/players/components/Flag";
import { PlayerAge } from "@/features/players/components/PlayerAge";
import { PlayerHonoursInline } from "@/features/players/components/PlayerCareerSummary";
import { PlayerImage } from "@/features/players/components/PlayerImage";
import type { SquadPlayer } from "@/types/api";
import { localizeDigits } from "@/utils/format";
import { revealProps } from "@/utils/reveal";
import { withSeason } from "@/utils/season";

const POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Attacker"] as const;
type Position = (typeof POSITIONS)[number];

// Translation-key maps (labels localized via the `teams` catalog, TASK-1603).
// `PLURAL_KEY` = the position-group heading; `SHORT_KEY` = the mobile tab strip.
const PLURAL_KEY: Record<Position, string> = {
  Goalkeeper: "posGoalkeepers",
  Defender: "posDefenders",
  Midfielder: "posMidfielders",
  Attacker: "posAttackers",
};
const SHORT_KEY: Record<Position, string> = {
  Goalkeeper: "posGkShort",
  Defender: "posDefShort",
  Midfielder: "posMidShort",
  Attacker: "posAttShort",
};

// the wire's `position` is the long form ("Goalkeeper" / "Defender" / …).
// Players returned without a position (rare — usually new signings before
// they're assigned a kit number) fall into the "Other" bucket so we don't
// silently drop them (AC: every player rendered exactly once).
function isCanonicalPosition(p: string | null): p is Position {
  return p === "Goalkeeper" || p === "Defender" || p === "Midfielder" || p === "Attacker";
}

export function groupSquadByPosition(players: SquadPlayer[]): {
  groups: Record<Position, SquadPlayer[]>;
  other: SquadPlayer[];
} {
  const groups: Record<Position, SquadPlayer[]> = {
    Goalkeeper: [],
    Defender: [],
    Midfielder: [],
    Attacker: [],
  };
  const other: SquadPlayer[] = [];
  for (const p of players) {
    if (isCanonicalPosition(p.position)) {
      groups[p.position].push(p);
    } else {
      other.push(p);
    }
  }
  return { groups, other };
}

type Props = { players: SquadPlayer[]; season: number };

// Phase 15 redesign (TASK-1506). Two layouts:
//   • Mobile (< md): position TABS (GK/DEF/MID/ATT) with one player per
//     full-width row — compact and tappable on a narrow screen.
//   • Tablet/desktop (≥ md): position-grouped PHOTO GRID — each position is a
//     full-width group (Goalkeepers → Defenders → Midfielders → Attackers) of
//     photo cards (photo, shirt number, name + nationality flag + age, captain).
export function SquadGrid({ players, season }: Props) {
  const t = useTranslations("teams");
  const { groups, other } = groupSquadByPosition(players);

  return (
    <section aria-label={t("squad")}>
      {/* Mobile: tabs + one player per full-width row. Radix Tabs only mounts
          the active TabsContent, so on mobile only the selected position is in
          the DOM. */}
      <div className="md:hidden">
        <Tabs defaultValue="Goalkeeper">
          <TabsList className="grid w-full grid-cols-4">
            {POSITIONS.map((pos) => (
              <TabsTrigger key={pos} value={pos} className="ix-tab ix-press">
                {t(SHORT_KEY[pos])}
              </TabsTrigger>
            ))}
          </TabsList>
          {POSITIONS.map((pos) => (
            <TabsContent key={pos} value={pos} className="mt-4">
              <PlayerRows players={groups[pos]} season={season} />
            </TabsContent>
          ))}
        </Tabs>
        {other.length > 0 && (
          <div className="mt-6 space-y-3">
            <h2 className="text-sm font-semibold tracking-tight">{t("posOther")}</h2>
            <PlayerRows players={other} season={season} />
          </div>
        )}
      </div>

      {/* Tablet/desktop: full-width position groups of photo cards. */}
      <div className="hidden space-y-6 md:block">
        {POSITIONS.map((pos) => (
          <PositionGroup
            key={pos}
            heading={t(PLURAL_KEY[pos])}
            players={groups[pos]}
            season={season}
          />
        ))}
        {other.length > 0 && (
          <PositionGroup heading={t("posOther")} players={other} season={season} />
        )}
      </div>
    </section>
  );
}

// --- Mobile: one player per full-width row -------------------------------

function PlayerRows({ players, season }: { players: SquadPlayer[]; season: number }) {
  const t = useTranslations("teams");
  if (players.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("noPlayers")}</p>;
  }
  return (
    <ul className="space-y-2">
      {players.map((p, i) => (
        <PlayerRow key={p.id} player={p} season={season} revealIndex={i} />
      ))}
    </ul>
  );
}

function PlayerRow({
  player,
  season,
  revealIndex,
}: {
  player: SquadPlayer;
  season: number;
  revealIndex: number;
}) {
  const t = useTranslations("teams");
  const locale = useLocale();
  return (
    <li {...revealProps(revealIndex)}>
      <Link
        href={withSeason(`/players/${player.id}`, season)}
        aria-label={t("viewPlayerProfile", { name: player.name })}
        className="focus-visible:ring-ring block rounded-xl focus-visible:ring-2 focus-visible:outline-none"
      >
        <Card className="ix-glow flex flex-row items-center gap-3 p-2.5">
          <div className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-md">
            <PlayerImage
              player={player}
              size="md"
              deceased={!!player.dateOfDeath}
              className="size-full"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <p className="truncate text-sm font-medium" title={player.name}>
                {player.name}
              </p>
              {player.isCaptain && <CaptainBadge />}
            </div>
            {(player.age !== null || player.nationalityCode) && (
              <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                {player.nationalityCode && (
                  <Flag
                    code={player.nationalityCode}
                    name={player.nationality}
                    className="text-[0.9rem]"
                  />
                )}
                {player.age !== null && (
                  <PlayerAge
                    age={player.age}
                    birthDate={player.birthDate}
                    dateOfDeath={player.dateOfDeath}
                    prefix={t("agePrefix")}
                  />
                )}
              </p>
            )}
          </div>
          {player.number !== null && (
            <Badge variant="secondary" className="shrink-0 tabular-nums">
              {localizeDigits(player.number, locale)}
            </Badge>
          )}
        </Card>
      </Link>
    </li>
  );
}

// --- Tablet/desktop: position-grouped photo grid -------------------------

function PositionGroup({
  heading,
  players,
  season,
}: {
  heading: string;
  players: SquadPlayer[];
  season: number;
}) {
  const t = useTranslations("teams");
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight">{heading}</h2>
      {players.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noPlayers")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {players.map((p, i) => (
            <PlayerCard key={p.id} player={p} season={season} revealIndex={i} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PlayerCard({
  player,
  season,
  revealIndex,
}: {
  player: SquadPlayer;
  season: number;
  revealIndex: number;
}) {
  const t = useTranslations("teams");
  const locale = useLocale();
  return (
    <li {...revealProps(revealIndex)}>
      <Link
        href={withSeason(`/players/${player.id}`, season)}
        aria-label={t("viewPlayerProfile", { name: player.name })}
        className="focus-visible:ring-ring group block rounded-xl focus-visible:ring-2 focus-visible:outline-none"
      >
        <Card className="ix-glow gap-0 overflow-hidden p-0">
          <div className="bg-muted relative aspect-[4/5] w-full overflow-hidden">
            <PlayerImage
              player={player}
              size="lg"
              deceased={!!player.dateOfDeath}
              className="size-full"
            />
            {player.number !== null && (
              <Badge
                variant="secondary"
                className="absolute top-1.5 right-1.5 tabular-nums shadow-sm"
              >
                {localizeDigits(player.number, locale)}
              </Badge>
            )}
          </div>
          <div className="px-2.5 py-2">
            <div className="flex items-center gap-1">
              <p className="truncate text-sm font-medium" title={player.name}>
                {player.name}
              </p>
              {player.isCaptain && <CaptainBadge />}
            </div>
            {(player.age !== null || player.nationalityCode) && (
              <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                {player.nationalityCode && (
                  <Flag
                    code={player.nationalityCode}
                    name={player.nationality}
                    className="text-[0.9rem]"
                  />
                )}
                {player.age !== null && (
                  <PlayerAge
                    age={player.age}
                    birthDate={player.birthDate}
                    dateOfDeath={player.dateOfDeath}
                    prefix={t("agePrefix")}
                  />
                )}
              </p>
            )}
            {/* TASK-M93 — trophies + caps, already on the row. Self-hides for an
                unenriched player AND for an enriched one with no silverware and
                no caps, so the grid does not sprout a row of zeros. */}
            <PlayerHonoursInline
              enrichment={player.enrichment ?? null}
              className="mt-0.5 flex items-center gap-2.5"
            />
          </div>
        </Card>
      </Link>
    </li>
  );
}

// Suspense fallback for the page-level `<SquadSection>` boundary — one group
// heading per position with a grid of photo-card skeletons.
export function SquadGridSkeleton() {
  const t = useTranslations("teams");
  return (
    <section aria-label={t("squadLoading")} className="space-y-6">
      {POSITIONS.map((pos) => (
        <div key={pos} className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">{t(PLURAL_KEY[pos])}</h2>
          <ul
            className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6"
            role="status"
            aria-label={t("loading")}
          >
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i}>
                <Card className="gap-0 overflow-hidden p-0">
                  <Skeleton className="aspect-[4/5] w-full rounded-none" />
                  <div className="px-2.5 py-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="mt-1.5 h-3 w-2/3" />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
