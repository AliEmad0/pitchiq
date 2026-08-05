import type { ViewSideTeam } from "@/features/game/view/match-view-model";
import { localizeDigits } from "@/utils/format";

interface Props {
  home: ViewSideTeam;
  away: ViewSideTeam;
  title: string;
  ariaLabel: string;
  locale: string;
}

function Column({ team, locale }: { team: ViewSideTeam; locale: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="bg-primary text-primary-foreground rounded px-1.5 py-0.5 font-mono text-[11px] font-bold">
          {team.abbr}
        </span>
        <span className="truncate text-sm font-semibold">{team.name}</span>
      </div>
      <ul className="divide-y divide-border/60">
        {team.players.map((p) => (
          <li key={p.playerId} className="flex items-center gap-2 py-1 text-sm">
            <span className="text-muted-foreground w-6 shrink-0 text-end font-mono tabular-nums">
              {localizeDigits(p.number, locale)}
            </span>
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className="text-muted-foreground bg-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]">
              {p.role}
            </span>
            {p.rating != null && (
              <span className="w-7 shrink-0 text-end font-mono text-xs font-semibold tabular-nums">
                {localizeDigits(p.rating, locale)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Full roster (number, name, position, rating) for both XIs — off the pitch (#3). */
export function RosterPanel({ home, away, title, ariaLabel, locale }: Props) {
  return (
    <section aria-label={ariaLabel} className="rounded-xl border border-border p-4">
      <h2 className="text-muted-foreground mb-3 font-mono text-[11px] font-bold uppercase tracking-widest">
        {title}
      </h2>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <Column team={home} locale={locale} />
        <Column team={away} locale={locale} />
      </div>
    </section>
  );
}
