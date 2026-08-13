"use client";
import { useTranslations } from "next-intl";
import type { GameTeam } from "@/features/game/domain/team";

/**
 * A read-only formation render for the VS screen.
 *
 * Deliberately NOT `TacticalPitch`: that component owns selection, eligibility
 * highlighting and error states, none of which mean anything once the squad is locked. A
 * separate presentational component is smaller than the read-only mode it would otherwise
 * have to grow.
 *
 * ⚠️ Rows render attack-first, so DOM order is NOT slot order — the same convention
 * `TacticalPitch` uses, so the two read alike.
 */
export function MiniPitch({ team }: { team: GameTeam }) {
  const t = useTranslations("game");
  const rows = [...new Set(team.formation.slots.map((s) => s.row))].sort((a, b) => b - a);

  return (
    <div
      role="group"
      aria-label={t("previewLineupAria", { team: team.name })}
      className="rounded-xl bg-[radial-gradient(120%_80%_at_50%_-10%,#12202c,#060a0f)] p-3 ring-1 ring-cyan-400/20"
    >
      <p className="mb-2 text-center text-sm font-bold text-white">{team.name}</p>
      {rows.map((row) => (
        <div key={row} className="mb-1.5 flex justify-center gap-1.5">
          {team.formation.slots
            .map((slot, index) => ({ slot, index }))
            .filter(({ slot }) => slot.row === row)
            .map(({ slot, index }) => (
              <span
                key={`${slot.row}-${slot.col}`}
                className="rounded bg-slate-800/80 px-1.5 py-1 text-[9px] font-semibold text-slate-200"
              >
                {team.players[index]?.name ?? slot.role}
              </span>
            ))}
        </div>
      ))}
    </div>
  );
}
