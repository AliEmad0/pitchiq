"use client";
import { useTranslations } from "next-intl";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import type { Provenance } from "@/features/game/domain/ratings";
import type { GameTeam } from "@/features/game/domain/team";
import { assignNumbers } from "@/features/game/view/pitch-model";
import { localizeDigits } from "@/utils/format";

interface Props {
  home: GameTeam;
  opponentName: string;
  opponentAvg: number;
  exiting: boolean;
  reduced: boolean;
  onReroll: () => void;
  onPlay: () => void;
  locale: string;
}

function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((t) => /[A-Za-z]/.test(t[0] ?? ""));
  const first = parts[0]?.[0] ?? name[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function eraOf(p: Provenance | null): { key: string; color: string } | null {
  if (!p) return null;
  if (p.tier === "sparse") return { key: "eraSparse", color: "#e0a63a" };
  return p.basis.hasXg ? { key: "eraXg", color: "#2ec5b6" } : { key: "eraRich", color: "#a35bd6" };
}

export function DraftScreen({
  home,
  opponentName,
  opponentAvg,
  exiting,
  reduced,
  onReroll,
  onPlay,
  locale,
}: Props) {
  const t = useTranslations("game");
  const numbers = assignNumbers(
    home.players.map((p) => ({ role: p.role ?? "CM", seed: p.playerId })),
  );

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
    <div className="mx-auto w-full max-w-3xl">
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
        className="overflow-hidden rounded-xl bg-[linear-gradient(90deg,#0c5a37_0_10%,#0a5230_10%_20%)] p-4 shadow-2xl ring-1 ring-white/10"
      >
        {rows.map((row) => (
          <div key={row} className="my-3 flex justify-center gap-3">
            {byRow.get(row)!.map((i) => {
              const p = home.players[i] as PoolCard;
              const era = eraOf(p.provenance);
              const idx = dealIndex++;
              return (
                <div
                  key={p.playerId}
                  data-exit={exiting}
                  style={{ animationDelay: reduced ? undefined : `${idx * 90}ms` }}
                  className="chaos-card w-[116px] overflow-hidden rounded-xl border border-white/15 bg-[linear-gradient(180deg,#1a2230,#0e141d)] text-white shadow-lg"
                >
                  <div className="h-1.5" style={{ background: era?.color ?? "#5b636d" }} />
                  <div className="relative grid h-16 place-items-center bg-[radial-gradient(80%_90%_at_50%_15%,#2a3a4d,#141c26)]">
                    <span className="absolute left-2 top-1 font-mono text-[13px] font-black text-[#dfe7f0]">
                      {localizeDigits(numbers[i], locale)}
                    </span>
                    <span className="absolute right-2 top-1 font-mono text-[13px] font-black text-[#ffd23f]">
                      {localizeDigits(p.ratings?.overall ?? 0, locale)}
                    </span>
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-[linear-gradient(160deg,#3a4a63,#222c3b)] text-[17px] font-black">
                      {initialsOf(p.name)}
                    </span>
                  </div>
                  <div className="px-2 pb-2 pt-1.5">
                    <div className="truncate text-[12.5px] font-bold">{p.name}</div>
                    <div className="mt-0.5 flex items-center justify-between text-[10.5px] text-[#9fb0c2]">
                      <span className="truncate">
                        {p.club} {localizeDigits(p.season, locale)}
                      </span>
                      {era && (
                        <span
                          className="ms-1 shrink-0 rounded px-1.5 py-px font-mono text-[8px] font-bold text-[#0b1017]"
                          style={{ background: era.color }}
                        >
                          {t(era.key)}
                        </span>
                      )}
                    </div>
                  </div>
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
          className="rounded-md border border-border bg-muted px-4 py-2 text-sm font-semibold"
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
          {t("avgLabel", { rating: localizeDigits(opponentAvg, locale) })}
        </span>
      </div>
    </div>
  );
}
