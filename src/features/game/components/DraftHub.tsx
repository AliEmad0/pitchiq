"use client";
import { useTranslations } from "next-intl";
import { useMemo, useReducer, useState } from "react";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import { FORMATIONS, type PoolCard } from "@/features/game/domain/chaos-draft";
import { fillGaps } from "@/features/game/domain/fill-gaps";
import { mulberry32 } from "@/features/game/domain/rng";
import { eligibleCards, eligibleSlots } from "@/features/game/view/draft-eligibility";
import {
  createDraftState,
  draftReducer,
  isComplete,
  validateSquad,
} from "@/features/game/view/draft-state";
import { randomSeed } from "@/features/game/view/seed";
import { prefersReducedMotion } from "@/utils/motion";
import { CardPool } from "./CardPool";
import { TacticalPitch } from "./TacticalPitch";

/**
 * Fixed, and used for the SERVER render only.
 *
 * The route is force-static, so the prerendered HTML is served identically to everyone
 * — and it deliberately contains no squad at all. The empty formation is the honest
 * starting state here, which sidesteps the visible-swap problem PR #97 had to solve on
 * Chaos. Entropy only arrives when the coach asks for it.
 */
const INITIAL_SEED = 20260811;

export function DraftHub({ pool }: { pool: PoolCard[] }) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();
  const [formationIndex, setFormationIndex] = useState(0);
  const [state, dispatch] = useReducer(draftReducer, createDraftState(FORMATIONS[0], INITIAL_SEED));

  const byId = useMemo(() => new Map(pool.map((c) => [c.cardId, c])), [pool]);
  const errors = useMemo(() => validateSquad(state, pool), [state, pool]);
  const complete = isComplete(state);
  const placed = useMemo(
    () => state.slots.filter((s): s is PlayerSeasonId => s != null),
    [state.slots],
  );

  const selectedSlot = state.selection?.kind === "slot" ? state.selection.index : null;
  const selectedCard = state.selection?.kind === "card" ? state.selection.cardId : null;

  // Both directions of the highlight: a held slot filters the pool, a held card lights
  // the legal slots. Supporting only one reads as broken to whoever has the other habit.
  const eligible = useMemo(() => {
    if (selectedSlot == null) return null;
    return eligibleCards(pool, state.formation.slots[selectedSlot].role).map((c) => c.cardId);
  }, [selectedSlot, state.formation, pool]);
  const highlighted = useMemo(() => {
    if (selectedCard == null) return [];
    const card = byId.get(selectedCard);
    return card ? eligibleSlots(state.formation, card) : [];
  }, [selectedCard, state.formation, byId]);

  const autoFill = () => {
    dispatch({
      type: "setSlots",
      slots: fillGaps(pool, state.formation, state.slots, mulberry32(randomSeed())),
    });
  };
  const reroll = () => {
    const empty = state.formation.slots.map(() => null);
    dispatch({
      type: "setSlots",
      slots: fillGaps(pool, state.formation, empty, mulberry32(randomSeed())),
    });
  };
  const changeFormation = (i: number) => {
    setFormationIndex(i);
    dispatch({ type: "setFormation", formation: FORMATIONS[i] });
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("draftTitle")}</h1>
      <p className="text-muted-foreground mb-4 mt-1 text-sm">{t("draftSubtitle")}</p>

      <div role="group" aria-label={t("draftFormation")} className="mb-3 flex flex-wrap gap-2">
        {FORMATIONS.map((f, i) => (
          <button
            key={f.name}
            type="button"
            onClick={() => changeFormation(i)}
            aria-pressed={formationIndex === i}
            className={
              formationIndex === i
                ? "bg-primary text-primary-foreground rounded-md px-3 py-1.5 font-mono text-xs font-bold"
                : "border-border rounded-md border px-3 py-1.5 font-mono text-xs font-bold"
            }
          >
            {f.name}
          </button>
        ))}
      </div>

      <TacticalPitch
        formation={state.formation}
        slots={state.slots}
        cards={pool}
        selectedSlot={selectedSlot}
        highlighted={highlighted}
        holdingCard={selectedCard != null}
        errors={errors}
        onSelectSlot={(index) => dispatch({ type: "selectSlot", index })}
        reduced={reduced}
      />

      <CardPool
        cards={pool}
        eligible={eligible}
        placed={placed}
        selectedCard={selectedCard}
        onSelectCard={(cardId) => dispatch({ type: "selectCard", cardId })}
        reduced={reduced}
      />

      {errors.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {errors.map((e) => (
            <li key={e.slotIndex} className="text-sm font-semibold text-red-400">
              {t("draftIllegal", { name: e.playerName, role: e.role })}
            </li>
          ))}
        </ul>
      ) : null}
      {!complete && errors.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-sm">{t("draftIncomplete")}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={autoFill}
          className="border-border bg-muted rounded-md border px-4 py-2 text-sm font-semibold"
        >
          {t("draftAutoFill")}
        </button>
        <button
          type="button"
          onClick={reroll}
          className="border-border rounded-md border px-4 py-2 text-sm font-semibold"
        >
          {t("draftReroll")}
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "reset", formation: state.formation, seed: state.seed })}
          className="border-border rounded-md border px-4 py-2 text-sm font-semibold"
        >
          {t("draftClear")}
        </button>
        <button
          type="button"
          disabled={!complete || errors.length > 0}
          className="bg-primary text-primary-foreground ms-auto rounded-md px-5 py-2 text-sm font-bold disabled:opacity-50"
        >
          {t("draftPlay")}
        </button>
      </div>
    </div>
  );
}
