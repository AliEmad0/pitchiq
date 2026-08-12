"use client";
import { useTranslations } from "next-intl";
import { useMemo, useReducer, useState } from "react";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import { FORMATIONS, type PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName, type Formation } from "@/features/game/domain/formation";
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
import { DraftRoom } from "./DraftRoom";
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

/**
 * The shape the hub opens on.
 *
 * Named rather than taken by position — the array's order is presentation only, so
 * inserting a shape must never silently change what the hub starts with.
 */
const DEFAULT_FORMATION = "4-4-2 Flat";

/**
 * Family boundaries into `FORMATIONS`, for grouping the picker only.
 *
 * ⚠️ Presentation, not identity. Nothing may resolve a shape through these — use
 * `formationByName`. If the array is ever reordered, only these three ranges change.
 */
const FAMILIES = [
  { labelKey: "formationBackFour", from: 0, to: 10 },
  { labelKey: "formationBackThree", from: 10, to: 16 },
  { labelKey: "formationHistoric", from: 16, to: 20 },
] as const;

interface Props {
  pool: PoolCard[];
  /**
   * Hand the finished XI up rather than starting the match here.
   *
   * The hub used to own the handoff itself, deliberately kept as one function so
   * TASK-1807 B could replace it without unpicking it from the component. This is that
   * replacement: the container owns the match now, and the hub is only about building a
   * legal squad.
   */
  onConfirm: (players: PoolCard[], formation: Formation) => void;
}

export function DraftHub({ pool, onConfirm }: Props) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();
  const [formationIndex, setFormationIndex] = useState(0);
  const [state, dispatch] = useReducer(
    draftReducer,
    createDraftState(formationByName(DEFAULT_FORMATION), INITIAL_SEED),
  );

  /**
   * The room is an ENTRY PATH into this builder, not a replacement for it (owner
   * decision, 2026-08-11) — so it lives inside the hub rather than on its own route. A
   * separate route would have to move the XI across a boundary, either serialising it
   * through B2's IndexedDB slot or lifting state above both.
   */
  const [mode, setMode] = useState<"build" | "room">("build");

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

  /** Resolve the slots to cards and hand them up. The container takes it from here. */
  const confirm = () => {
    const players = state.slots
      .map((id) => (id != null ? byId.get(id) : undefined))
      .filter((c): c is PoolCard => c != null);
    onConfirm(players, state.formation);
  };

  if (mode === "room") {
    return (
      <DraftRoom
        pool={pool}
        formation={state.formation}
        seed={state.seed}
        onComplete={(cardIds) => {
          // ⚠️ `setSlots` is the EXISTING seam — the reducer already takes
          // `(PlayerSeasonId | null)[]`, so the room needs no bespoke handoff and the XI
          // arrives fully editable.
          dispatch({ type: "setSlots", slots: cardIds });
          setMode("build");
        }}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("draftTitle")}</h1>
      <p className="text-muted-foreground mb-4 mt-1 text-sm">{t("draftSubtitle")}</p>

      <div className="mb-3">
        <label htmlFor="formation" className="sr-only">
          {t("draftFormation")}
        </label>
        <select
          id="formation"
          aria-label={t("draftFormation")}
          value={formationIndex}
          onChange={(e) => changeFormation(Number(e.target.value))}
          className="border-border bg-background rounded-md border px-3 py-1.5 font-mono text-xs font-bold"
        >
          {FAMILIES.map(({ labelKey, from, to }) => (
            <optgroup key={labelKey} label={t(labelKey)}>
              {FORMATIONS.slice(from, to).map((f, i) => (
                <option key={f.name} value={from + i}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
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
          onClick={() => setMode("room")}
          className="border-border rounded-md border px-4 py-2 text-sm font-semibold"
        >
          {t("roomOpen")}
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
          onClick={confirm}
          className="bg-primary text-primary-foreground ms-auto rounded-md px-5 py-2 text-sm font-bold disabled:opacity-50"
        >
          {t("draftPlay")}
        </button>
      </div>
    </div>
  );
}
