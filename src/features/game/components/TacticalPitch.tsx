"use client";
import { useTranslations } from "next-intl";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import type { Formation } from "@/features/game/domain/formation";
import type { SquadError } from "@/features/game/view/draft-state";

interface Props {
  formation: Formation;
  slots: readonly (PlayerSeasonId | null)[];
  cards: readonly PoolCard[];
  selectedSlot: number | null;
  /** Slot indices the currently-held card may legally fill. */
  highlighted: readonly number[];
  /**
   * Is the coach holding a card? Distinct from `highlighted.length > 0`, because a card
   * with no legal slot left must still disable every slot rather than all of them.
   */
  holdingCard: boolean;
  errors: readonly SquadError[];
  onSelectSlot: (index: number) => void;
  reduced: boolean;
}

/**
 * The formation as clickable slots on a full-detail VERTICAL pitch — boxes, six-yard
 * lines, centre circle, mowing stripes — with each man as a circular chip carrying his
 * OVERALL, the owner's TASK-1834 "Market" pick (chosen over the old 80×80 squares).
 *
 * Presentational on purpose: every piece of state arrives as a prop, so the reducer is
 * testable without rendering and this is testable without the engine.
 *
 * ⚠️ Chips render attack-first, so DOM order is NOT slot order — `onSelectSlot` always
 * reports the formation index. Formation Morph rides an inline `top`/`left` transition
 * on absolutely-positioned chips: the motion audit governs `@keyframes` only, and
 * moving eleven absolute elements re-lays-out nothing around them.
 */
export function TacticalPitch({
  formation,
  slots,
  cards,
  selectedSlot,
  highlighted,
  holdingCard,
  errors,
  onSelectSlot,
  reduced,
}: Props) {
  const t = useTranslations("game");
  const byId = new Map(cards.map((c) => [c.cardId, c]));
  const invalid = new Set(errors.map((e) => e.slotIndex));
  const maxRow = Math.max(...formation.slots.map((s) => s.row));

  // Attack-first DOM order (a teamsheet reads top-down), positions from the grid:
  // row 1 is the goalkeeper line at the foot of the pitch.
  const order = formation.slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => b.slot.row - a.slot.row || a.slot.col - b.slot.col);

  return (
    <div role="group" aria-label={t("draftPitchAria")} className="tp-pitch">
      <span className="tp-line tp-half" aria-hidden />
      <span className="tp-line tp-circle" aria-hidden />
      <span className="tp-line tp-spot" aria-hidden />
      <span className="tp-line tp-box tp-box-top" aria-hidden />
      <span className="tp-line tp-six tp-six-top" aria-hidden />
      <span className="tp-line tp-box tp-box-bottom" aria-hidden />
      <span className="tp-line tp-six tp-six-bottom" aria-hidden />
      {order.map(({ slot, index }) => {
        const rowWidth = formation.slots.filter((s) => s.row === slot.row).length;
        const left = (slot.col / (rowWidth + 1)) * 100;
        const top = maxRow === 1 ? 50 : 86 - ((slot.row - 1) / (maxRow - 1)) * 72;
        const held = slots[index];
        const card = held != null ? byId.get(held) : undefined;
        const overall = card?.ratings?.overall;
        const isSelected = selectedSlot === index;
        const isLegal = highlighted.includes(index);
        const isInvalid = invalid.has(index);
        // ⚠️ Symmetry with the pool, and the other half of the hard ban. Ineligible
        // CARDS are disabled when a slot is held; ineligible SLOTS must be disabled
        // when a card is held, or the coach can drop a centre-back into a striker
        // slot and only find out when Play refuses to light up.
        const blocked = holdingCard && !isLegal;
        return (
          <button
            key={index}
            type="button"
            disabled={blocked}
            onClick={() => onSelectSlot(index)}
            aria-pressed={isSelected}
            data-invalid={isInvalid ? "true" : undefined}
            aria-label={
              card
                ? t("draftFilledSlot", { name: card.name, role: slot.role })
                : t("draftEmptySlot", { role: slot.role })
            }
            style={{
              left: `${left}%`,
              top: `${top}%`,
              transition: reduced
                ? undefined
                : "top 320ms cubic-bezier(.5,0,.2,1), left 320ms cubic-bezier(.5,0,.2,1)",
            }}
            className={[
              "tp-slot",
              blocked ? "opacity-30" : "",
              isInvalid
                ? "tp-invalid"
                : isSelected
                  ? "tp-selected"
                  : isLegal
                    ? "tp-legal"
                    : card
                      ? "tp-filled"
                      : "",
            ].join(" ")}
          >
            <span className="tp-chip">
              {card ? (
                <span className="tp-ovr">{overall ?? "–"}</span>
              ) : (
                <span className="tp-role">{slot.role}</span>
              )}
            </span>
            {card ? <span className="tp-name">{card.name}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
