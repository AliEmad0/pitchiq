"use client";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import type { ChooserSpec, DraftSpec } from "@/features/game/domain/rule-packs";
import { localizeDigits } from "@/utils/format";
import { GamePlay } from "./GamePlay";

/**
 * TASK-1810 — the shared container every rule-pack mode runs through.
 *
 * ⚠️ The chooser is a CLIENT-SIDE FILTER, not a route and not a phase. Every selectable
 * club's cards are already in the prerendered payload, so choosing one filters an array —
 * no navigation, and nothing added to the match machine, which matters because pre-match
 * is a phase and the live session lives in component memory.
 */
export function ModePlay({
  pool,
  chooser,
  draft,
}: {
  pool: PoolCard[];
  chooser?: ChooserSpec;
  draft?: DraftSpec;
}) {
  const t = useTranslations("game");
  const locale = useLocale();
  const [teamId, setTeamId] = useState<number | null>(null);

  /** Club labels come from the CARDS, never from source — the AST guard forbids literals. */
  const clubs = useMemo(() => {
    const seen = new Map<number, { name: string; count: number }>();
    for (const c of pool) {
      if (c.teamId == null) continue;
      const e = seen.get(c.teamId) ?? { name: c.club, count: 0 };
      e.count += 1;
      seen.set(c.teamId, e);
    }
    return [...seen.entries()].map(([id, v]) => ({ id, ...v }));
  }, [pool]);

  const filtered = useMemo(
    () => (teamId == null ? pool : pool.filter((c) => c.teamId === teamId)),
    [pool, teamId],
  );

  if (chooser != null && teamId == null) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-extrabold tracking-tight">{t("legacyTitle")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("legacyPick")}</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {clubs.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setTeamId(c.id)}
                className="border-border hover:bg-muted flex w-full items-baseline justify-between rounded-lg border px-4 py-3 text-start"
              >
                <span className="font-bold">{c.name}</span>
                <span className="text-muted-foreground font-mono text-xs">
                  {t("legacyCards", { count: localizeDigits(c.count, locale) })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <GamePlay
      pool={filtered}
      initialPhase="setup"
      draft={draft}
      // Only offered when there is somewhere to go back TO. Without it a coach who picked
      // a club would be stuck with it for the whole session.
      onBack={chooser != null ? () => setTeamId(null) : undefined}
    />
  );
}
