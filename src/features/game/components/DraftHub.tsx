"use client";
import { useTranslations } from "next-intl";
import { useMemo, useReducer, useState } from "react";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
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
import { FormationPicker } from "./FormationPicker";
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

/** The stadium-board readout over the market: slots filled and the XI's average. */
function DraftTicker({ filled, total, avg }: { filled: number; total: number; avg: number }) {
  const t = useTranslations("game");
  return (
    <div className="draft-ticker" role="status" aria-label={t("tickerAria")}>
      <div className="draft-ticker-cell">
        <span className="draft-ticker-label">{t("tickerFilled")}</span>
        <span className="draft-ticker-num">
          {filled}
          <span className="draft-ticker-of">/{total}</span>
        </span>
      </div>
      <span className="draft-ticker-dot" aria-hidden>
        ·
      </span>
      <div className="draft-ticker-cell">
        <span className="draft-ticker-label">{t("tickerAvg")}</span>
        <span className="draft-ticker-num">{filled > 0 ? avg : "–"}</span>
      </div>
    </div>
  );
}

export function DraftHub({ pool, onConfirm }: Props) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();
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
  /** The board's average — over the cards actually placed, not the empty slots. */
  const avg = useMemo(() => {
    const ratings = placed
      .map((id) => byId.get(id)?.ratings?.overall)
      .filter((r): r is number => r != null);
    return ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : 0;
  }, [placed, byId]);

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
  const changeFormation = (formation: Formation) => {
    dispatch({ type: "setFormation", formation });
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
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("draftTitle")}</h1>
      <p className="text-muted-foreground mb-4 mt-1 text-sm">{t("draftSubtitle")}</p>

      <DraftTicker filled={placed.length} total={state.formation.slots.length} avg={avg} />

      {/* The market and the pitch stand side by side at ONE height — the pool scrolls
          vertically inside its column, never the page sideways (owner spec, TASK-1834). */}
      <div className="draft-market">
        <CardPool
          cards={pool}
          eligible={eligible}
          placed={placed}
          selectedCard={selectedCard}
          onSelectCard={(cardId) => dispatch({ type: "selectCard", cardId })}
          reduced={reduced}
        />
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
      </div>

      <section className="mt-5">
        <h2 className="text-base font-extrabold tracking-tight">{t("pitchShapeTitle")}</h2>
        <p className="text-muted-foreground mb-3 mt-0.5 text-xs">{t("draftShapeHint")}</p>
        <FormationPicker value={state.formation} onChange={changeFormation} />
      </section>

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

      {/* The full-width action rail, then Play across the whole line beneath it. */}
      <div className="mt-4 flex flex-wrap items-stretch gap-3">
        <button
          type="button"
          onClick={autoFill}
          className="border-border bg-muted flex-1 rounded-md border px-4 py-2 text-sm font-semibold"
        >
          {t("draftAutoFill")}
        </button>
        <button
          type="button"
          onClick={reroll}
          className="border-border flex-1 rounded-md border px-4 py-2 text-sm font-semibold"
        >
          {t("draftReroll")}
        </button>
        <button
          type="button"
          onClick={() => setMode("room")}
          className="border-border flex-1 rounded-md border px-4 py-2 text-sm font-semibold"
        >
          {t("roomOpen")}
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "reset", formation: state.formation, seed: state.seed })}
          className="border-border flex-1 rounded-md border px-4 py-2 text-sm font-semibold"
        >
          {t("draftClear")}
        </button>
      </div>
      <button
        type="button"
        disabled={!complete || errors.length > 0}
        onClick={confirm}
        data-reduced={reduced ? "true" : undefined}
        className="draft-play bg-primary text-primary-foreground mt-3 w-full rounded-md px-5 py-3 text-sm font-bold disabled:opacity-50"
      >
        {t("draftPlay")}
      </button>
    </div>
  );
}
