"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  COLLECTION_SURFACES,
  GAME_MODES,
  MODE_GROUPS,
  isPlayable,
  modesInGroup,
  type ModeId,
} from "@/features/game/domain/modes";
import { ModeTile } from "./ModeTile";

/**
 * The gate: every mode the game has or will have, and the way into the two that work.
 *
 * ⚠️ Renders entirely from `domain/modes.ts`. Nothing here knows what "Season" is — a
 * mode's status drives everything, so unlocking one later is a data change (TASK-1832 D5).
 *
 * ⚠️ Loads NO data and imports no `adapter/*`. That is what keeps `/game` trivially
 * static, and it is why the eventual redesign (D10 — the 30-concept ritual was skipped
 * deliberately to get the base shipped) can replace this file wholesale.
 *
 * One `useState` rather than a reducer: there is a single piece of state and no illegal
 * transition to guard against, unlike `draft-state` / `room-state` / `play-machine`.
 */
export function ModeGate() {
  const t = useTranslations("game");
  const [open, setOpen] = useState<ModeId | null>(null);

  const playable = GAME_MODES.filter(isPlayable);

  return (
    <div aria-label={t("gateAria")} className="mx-auto w-full max-w-5xl">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("hubTitle")}</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">{t("hubSubtitle")}</p>

      <h2 className="text-muted-foreground mb-2 font-mono text-[10px] font-bold tracking-widest uppercase">
        {t("sectionPlayNow")}
      </h2>
      <div className="mb-7 flex flex-wrap items-start gap-3">
        {playable.map((mode) => (
          <div key={mode.id} className="min-w-[200px] flex-1">
            <ModeTile
              mode={mode}
              open={open === mode.id}
              onOpen={(id) => setOpen((prior) => (prior === id ? null : id))}
            />
          </div>
        ))}
      </div>

      <h2 className="text-muted-foreground mb-2 font-mono text-[10px] font-bold tracking-widest uppercase">
        {t("sectionComingSoon")}
      </h2>
      {MODE_GROUPS.map((group) => {
        const locked = modesInGroup(group.id).filter((m) => !isPlayable(m));
        if (locked.length === 0) return null;
        return (
          <div key={group.id} className="mb-3">
            <h3 className="text-muted-foreground mb-1.5 text-[10px] font-semibold uppercase opacity-70">
              {t(group.labelKey)}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {locked.map((mode) => (
                <ModeTile key={mode.id} mode={mode} open={false} onOpen={() => {}} />
              ))}
            </div>
          </div>
        );
      })}

      <div className="border-border mt-6 border-t pt-4">
        <h3 className="text-muted-foreground mb-1.5 text-[10px] font-semibold uppercase opacity-70">
          {t("groupCollection")}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {COLLECTION_SURFACES.map((surface) => (
            <div
              key={surface.id}
              className="border-border rounded-full border border-dashed px-3 py-1 text-xs opacity-45"
            >
              <span aria-hidden>{surface.emoji}</span> {t(surface.nameKey)}
              <span className="ms-1 opacity-70">{t("statusPlanned")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
