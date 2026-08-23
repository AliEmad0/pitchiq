"use client";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { PlayerCard } from "./PlayerCard";

interface Props {
  cards: readonly PoolCard[];
  /** Card ids that may fill the selected slot, or null when no slot is selected. */
  eligible: readonly PlayerSeasonId[] | null;
  placed: readonly PlayerSeasonId[];
  selectedCard: PlayerSeasonId | null;
  onSelectCard: (cardId: PlayerSeasonId) => void;
  reduced: boolean;
}

/** How many cards get a stagger before the delay is capped — beyond this it drags. */
const STAGGER_CAP = 24;
const STAGGER_MS = 18;

/**
 * The card market (TASK-1834 "The Market", the owner's pick): the pool browses as the
 * REAL PlayerCard faces — the same Vault/premium artwork every other surface deals —
 * in a grid that scrolls vertically only.
 *
 * Grid Cascade survives the redesign: when eligibility changes the eligible cards sort
 * to the front and the wall restages in a staggered wave, so THE POOL is the feedback
 * surface — no banner, no toast. The re-order is a React key reorder; the motion is a
 * per-card `animation-delay` over a transform/opacity keyframe, which is what keeps it
 * clear of the motion audit's ban on animating layout properties.
 *
 * ⚠️ Each card renders `interactive={false}` — the FACE as a plain element. The market
 * tile is itself a button, and a card that is its own button nested inside it would be
 * silently ejected by the HTML parser (the TASK-1810 lesson).
 */
export function CardPool({ cards, eligible, placed, selectedCard, onSelectCard, reduced }: Props) {
  const t = useTranslations("game");
  const eligibleSet = useMemo(() => (eligible ? new Set(eligible) : null), [eligible]);
  const placedSet = useMemo(() => new Set(placed), [placed]);

  const ordered = useMemo(() => {
    if (eligibleSet == null) return [...cards];
    // Eligible first, original order preserved within each group, so the cascade reads
    // as a re-sort rather than a reshuffle.
    return [...cards].sort(
      (a, b) => (eligibleSet.has(a.cardId) ? 0 : 1) - (eligibleSet.has(b.cardId) ? 0 : 1),
    );
  }, [cards, eligibleSet]);

  // Changing this remounts the cards, which replays the cascade. The eligible set IS
  // the reason to replay it, so it is exactly the right key.
  const stageKey = eligible ? eligible.length : -1;

  return (
    <div role="group" aria-label={t("draftPoolAria")} className="draft-pool">
      {eligibleSet != null ? (
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-cyan-200/70">
          {t("draftEligibleCount", { count: eligibleSet.size })}
        </p>
      ) : null}
      <div className="draft-pool-grid">
        {ordered.map((card, i) => {
          const allowed = eligibleSet == null || eligibleSet.has(card.cardId);
          const isPlaced = placedSet.has(card.cardId);
          return (
            <button
              key={`${stageKey}:${card.cardId}`}
              type="button"
              disabled={!allowed}
              onClick={() => onSelectCard(card.cardId)}
              aria-pressed={selectedCard === card.cardId}
              aria-label={card.name}
              data-placed={isPlaced ? "true" : undefined}
              style={
                reduced
                  ? undefined
                  : {
                      animation: "draft-cascade 260ms both",
                      animationDelay: `${Math.min(i, STAGGER_CAP) * STAGGER_MS}ms`,
                    }
              }
              className={[
                "draft-card draft-pool-card",
                selectedCard === card.cardId
                  ? "draft-pool-selected"
                  : isPlaced
                    ? "draft-pool-placed"
                    : "",
                allowed ? "" : "opacity-30",
              ].join(" ")}
            >
              <span className="draft-pool-cardbox">
                <PlayerCard card={card as EnrichedCard} reduced={reduced} interactive={false} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
