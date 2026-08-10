import type { LineupState } from "@/features/game/view/lineup-state";
import type { ViewSideTeam } from "@/features/game/view/match-view-model";
import { PlayerBadges } from "./PlayerBadges";

interface BadgeLabels {
  goal: string;
  assist: string;
  yellow: string;
  red: string;
  subOn: string;
  subOff: string;
}

interface Props {
  home: ViewSideTeam;
  away: ViewSideTeam;
  homeLineup: LineupState;
  awayLineup: LineupState;
  title: string;
  ariaLabel: string;
  labels: BadgeLabels;
}

function Column({
  team,
  lineup,
  labels,
}: {
  team: ViewSideTeam;
  lineup: LineupState;
  labels: BadgeLabels;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="bg-primary text-primary-foreground rounded px-1.5 py-0.5 font-mono text-[11px] font-bold">
          {team.abbr}
        </span>
        <span className="truncate text-sm font-semibold">{team.name}</span>
      </div>
      <ul className="divide-border/60 divide-y">
        {lineup.roster.map((row) => (
          <li
            key={row.player.playerId}
            // A player who has gone off stays listed but recedes — he was part of the
            // match, he is just not in it any more.
            className={`flex items-center gap-2 py-1 text-sm ${row.onPitch ? "" : "opacity-45"}`}
          >
            <span className="text-muted-foreground w-6 shrink-0 text-end font-mono tabular-nums">
              {row.player.number}
            </span>
            <span className="min-w-0 flex-1 truncate">{row.player.name}</span>
            <PlayerBadges badges={row.badges} labels={labels} />
            <span className="text-muted-foreground bg-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]">
              {row.player.role}
            </span>
            {row.player.rating != null && (
              <span className="w-7 shrink-0 text-end font-mono text-xs font-semibold tabular-nums">
                {row.player.rating}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Both squads, as they stand RIGHT NOW — goals, assists, cards and substitutions marked.
 *
 * Driven by `lineupAt` rather than the starting XI, so the list agrees with the pitch:
 * substitutes appear when they come on, and nobody's badges are invented here.
 */
export function RosterPanel({
  home,
  away,
  homeLineup,
  awayLineup,
  title,
  ariaLabel,
  labels,
}: Props) {
  return (
    <section aria-label={ariaLabel} className="border-border rounded-xl border p-4">
      <h2 className="text-muted-foreground mb-3 font-mono text-[11px] font-bold tracking-widest uppercase">
        {title}
      </h2>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <Column team={home} lineup={homeLineup} labels={labels} />
        <Column team={away} lineup={awayLineup} labels={labels} />
      </div>
    </section>
  );
}
