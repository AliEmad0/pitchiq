"use client";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";

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
 * The lower-third pool strip.
 *
 * Grid Cascade: when eligibility changes the eligible cards sort to the front and the
 * strip restages in a staggered wave, so THE POOL is the feedback surface — no banner,
 * no toast. The re-order is a React key reorder; the motion is a per-card
 * `animation-delay` over a transform/opacity keyframe, which is what keeps it clear of
 * the motion audit's ban on animating layout properties.
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
    <div
      role="group"
      aria-label={t("draftPoolAria")}
      className="mt-4 rounded-xl border border-cyan-400/20 bg-[#060a0f]/80 p-3"
    >
      {eligibleSet != null ? (
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-cyan-200/70">
          {t("draftEligibleCount", { count: eligibleSet.size })}
        </p>
      ) : null}
      <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-6">
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
                "draft-card rounded-lg border p-2 text-start",
                selectedCard === card.cardId
                  ? "border-cyan-300 bg-cyan-400/20"
                  : isPlaced
                    ? "border-emerald-400/50 bg-emerald-400/10"
                    : "border-white/10 bg-white/5",
                allowed ? "hover:border-cyan-300/60" : "opacity-30",
              ].join(" ")}
            >
              <span className="block truncate text-[11px] font-semibold text-white">
                {card.name}
              </span>
              <span className="block font-mono text-[10px] text-cyan-200/60">{card.role}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
