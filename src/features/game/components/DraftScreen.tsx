"use client";
import { useTranslations } from "next-intl";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import type { GameTeam } from "@/features/game/domain/team";
import { PlayerCard } from "./PlayerCard";

interface Props {
  home: GameTeam;
  opponentName: string;
  opponentAvg: number;
  exiting: boolean;
  reduced: boolean;
  onReroll: () => void;
  onPlay: () => void;
}

export function DraftScreen({
  home,
  opponentName,
  opponentAvg,
  exiting,
  reduced,
  onReroll,
  onPlay,
}: Props) {
  const t = useTranslations("game");

  // Group players by formation line, attackers on top → GK at the bottom.
  const byRow = new Map<number, number[]>();
  home.formation.slots.forEach((s, i) => {
    const arr = byRow.get(s.row) ?? [];
    arr.push(i);
    byRow.set(s.row, arr);
  });
  const rows = [...byRow.keys()].sort((a, b) => b - a);
  let dealIndex = 0;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">{t("chaosTitle")}</h1>
        <span className="bg-primary text-primary-foreground rounded px-2 py-0.5 font-mono text-[11px] font-bold">
          {home.formation.name}
        </span>
      </div>
      <p className="text-muted-foreground mb-5 mt-1 text-sm">{t("chaosSubtitle")}</p>

      <div
        role="group"
        aria-label={t("draftAria")}
        className="rounded-2xl bg-[radial-gradient(120%_80%_at_50%_-10%,#12202c,#080c11)] p-5 shadow-2xl ring-1 ring-white/10"
      >
        {rows.map((row) => (
          <div key={row} className="my-4 flex flex-wrap justify-center gap-3">
            {byRow.get(row)!.map((i) => {
              const idx = dealIndex++;
              return (
                <div
                  key={home.players[i].playerId}
                  data-exit={exiting}
                  style={{ animationDelay: reduced ? undefined : `${idx * 90}ms` }}
                  className="chaos-card"
                >
                  <PlayerCard card={home.players[i] as EnrichedCard} reduced={reduced} />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onReroll}
          className="border-border bg-muted rounded-md border px-4 py-2 text-sm font-semibold"
        >
          {t("reroll")}
        </button>
        <button
          type="button"
          onClick={onPlay}
          className="bg-primary text-primary-foreground rounded-md px-5 py-2 text-sm font-bold"
        >
          {t("playMatch")}
        </button>
        <span className="text-muted-foreground ms-auto text-xs">
          {t("opponentLabel")}: <b className="text-foreground">{opponentName}</b> ·{" "}
          {t("avgLabel", { rating: opponentAvg })}
        </span>
      </div>
    </div>
  );
}
