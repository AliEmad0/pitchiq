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
 * The formation as clickable slots, in the Broadcast Teamsheet language — dark ground,
 * cyan keylines, attack at the top.
 *
 * Presentational on purpose: every piece of state arrives as a prop, so the reducer is
 * testable without rendering and this is testable without the engine.
 *
 * ⚠️ Rows render attack-first, so DOM order is NOT slot order — `onSelectSlot` always
 * reports the formation index. Formation Morph rides an inline `transform` transition
 * rather than a keyframe: the motion audit governs `@keyframes` only, and a slot's
 * position is a layout property, so a transform is both compliant and the only way it
 * can move smoothly.
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
  // Row 1 is the goalkeeper line; a teamsheet reads top-down with the attack on top.
  const rows = [...new Set(formation.slots.map((s) => s.row))].sort((a, b) => b - a);

  return (
    <div
      role="group"
      aria-label={t("draftPitchAria")}
      className="rounded-2xl bg-[radial-gradient(120%_80%_at_50%_-10%,#12202c,#060a0f)] p-4 shadow-2xl ring-1 ring-cyan-400/20"
    >
      {rows.map((row) => (
        <div key={row} className="my-3 flex flex-wrap justify-center gap-3">
          {formation.slots.map((slot, i) => {
            if (slot.row !== row) return null;
            const held = slots[i];
            const card = held != null ? byId.get(held) : undefined;
            const isSelected = selectedSlot === i;
            const isLegal = highlighted.includes(i);
            const isInvalid = invalid.has(i);
            // ⚠️ Symmetry with the pool, and the other half of the hard ban. Ineligible
            // CARDS are disabled when a slot is held; ineligible SLOTS must be disabled
            // when a card is held, or the coach can drop a centre-back into a striker
            // slot and only find out when Play refuses to light up.
            const blocked = holdingCard && !isLegal;
            return (
              <button
                key={i}
                type="button"
                disabled={blocked}
                onClick={() => onSelectSlot(i)}
                aria-pressed={isSelected}
                data-invalid={isInvalid ? "true" : undefined}
                aria-label={
                  card
                    ? t("draftFilledSlot", { name: card.name, role: slot.role })
                    : t("draftEmptySlot", { role: slot.role })
                }
                style={{
                  transition: reduced ? undefined : "transform 320ms cubic-bezier(.5,0,.2,1)",
                }}
                className={[
                  "flex h-20 w-20 flex-col items-center justify-center rounded-lg border text-center",
                  blocked ? "opacity-30" : "",
                  isInvalid
                    ? "border-red-500 bg-red-500/15"
                    : isSelected
                      ? "border-cyan-300 bg-cyan-400/20"
                      : isLegal
                        ? "border-emerald-400 bg-emerald-400/10"
                        : card
                          ? "border-cyan-400/30 bg-cyan-400/5"
                          : "border-dashed border-white/25",
                ].join(" ")}
              >
                <span className="font-mono text-[10px] uppercase tracking-wider text-cyan-200/70">
                  {slot.role}
                </span>
                {card ? (
                  <span className="mt-1 line-clamp-2 px-1 text-[11px] font-semibold leading-tight text-white">
                    {card.name}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
