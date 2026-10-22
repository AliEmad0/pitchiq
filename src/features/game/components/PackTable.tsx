"use client";

import { useTranslations } from "next-intl";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { pickBack } from "@/features/game/domain/card-design";
import type { RewardId } from "@/features/game/domain/market";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { prefersReducedMotion } from "@/utils/motion";
import { CardBack } from "./PlayerCard";

/**
 * The Mystery Market pack as the owner's picks (2026-10-22): layout Pack #1 "Three-Card Table" and
 * motion #1 "Triple Flip". The cards rise onto the felt, all three hop and turn over TOGETHER on
 * Open, and the kept card swells with a gold halo while the other two sink off the table.
 *
 * Each card is footprint → mover → scaler → flipper: the hop and the halo own the mover's
 * `transform`, the flip owns the flipper's, so neither overwrites the static scale between them.
 * ⚠️ Phase timers live here, never in `domain/` — the pack itself is decided by `packFor`.
 */
export type PackPhase = "arrive" | "closed" | "reveal" | "open" | "keep";

/** The gallery's measured durations (ms) for Triple Flip. */
export const PACK_TIMING = { arrive: 650, reveal: 720, keep: 700 } as const;

const ICON: Record<RewardId, string> = {
  marquee: "⭐",
  wonderkid: "🌱",
  gegenpress: "⚡",
  ironCurtain: "🛡️",
  talismanTonic: "🧪",
  physio: "➕",
};

export function PackTable({
  pack,
  backs,
  onTake,
}: {
  pack: readonly RewardId[];
  /** One pool card per slot, lending its seeded back — the app's own artwork. */
  backs: readonly EnrichedCard[];
  onTake: (id: RewardId) => void;
}) {
  const t = useTranslations("gameMarket");
  const [reduced] = useState(() => prefersReducedMotion());
  const [phase, setPhase] = useState<PackPhase>(reduced ? "closed" : "arrive");
  const [kept, setKept] = useState<RewardId | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taken = useRef(false);

  useEffect(() => {
    if (phase !== "arrive") return;
    const id = setTimeout(() => setPhase("closed"), PACK_TIMING.arrive);
    return () => clearTimeout(id);
  }, [phase]);

  useEffect(
    () => () => {
      if (timer.current != null) clearTimeout(timer.current);
    },
    [],
  );

  const open = () => {
    if (reduced) {
      setPhase("open");
      return;
    }
    setPhase("reveal");
    timer.current = setTimeout(() => setPhase("open"), PACK_TIMING.reveal);
  };

  const take = (id: RewardId) => {
    // Answered exactly once: a second tap during the halo must not take a second reward.
    if (taken.current) return;
    taken.current = true;
    if (reduced) {
      onTake(id);
      return;
    }
    setKept(id);
    setPhase("keep");
    timer.current = setTimeout(() => onTake(id), PACK_TIMING.keep);
  };

  const faceUp = phase === "reveal" || phase === "open" || phase === "keep";
  const pickable = phase === "open";

  return (
    <div className="pk-table" data-ph={phase} data-testid="pack-table">
      <h2 className="pk-title">{t("packTitle")}</h2>
      <p className="pk-hint">{faceUp ? t("packPick") : t("packHint")}</p>
      <div className="pk-row">
        {pack.map((id, i) => {
          const back = backs[i % backs.length]!;
          const state = kept == null ? "" : id === kept ? " pk-kept" : " pk-gone";
          const face = (
            <>
              <span className="pk-ic" aria-hidden="true">
                {ICON[id]}
              </span>
              <b className="pk-nm">{t(`reward.${id}.name`)}</b>
              <span className="pk-bn mm-boon">＋ {t(`reward.${id}.boon`)}</span>
              <span className="pk-ct mm-catch">− {t(`reward.${id}.catch`)}</span>
            </>
          );
          const card = (
            <div className="pk-mv">
              <div className="pk-sc">
                <div className="pk-fl">
                  <div className="pk-face pk-back" aria-hidden="true">
                    <CardBack card={back} back={pickBack(back)} />
                  </div>
                  <div className="pk-face pk-front" aria-hidden={!faceUp}>
                    {face}
                  </div>
                </div>
              </div>
            </div>
          );
          const style = { "--i": i } as CSSProperties;
          // Only an opened card is a control (and carries the reward testid); a face-down card is
          // not a dead stop in the tab order.
          return faceUp && phase !== "reveal" ? (
            <button
              key={id}
              type="button"
              className={`pk-slot${state}`}
              style={style}
              data-testid="market-reward"
              data-reward={id}
              disabled={!pickable}
              onClick={() => take(id)}
            >
              {card}
            </button>
          ) : (
            <div
              key={id}
              className="pk-slot"
              style={style}
              aria-label={faceUp ? undefined : t("faceDown")}
              role={faceUp ? undefined : "img"}
            >
              {card}
            </div>
          );
        })}
      </div>
      {phase === "arrive" || phase === "closed" ? (
        <button type="button" className="pk-go" data-testid="market-open" onClick={open}>
          {t("open")}
        </button>
      ) : null}
    </div>
  );
}
