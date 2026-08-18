"use client";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { HAND_SIZE, roomDeals } from "@/features/game/domain/draft-room";
import type { Formation } from "@/features/game/domain/formation";
import type { DraftSpec } from "@/features/game/domain/rule-packs";
import { createRoomState, isRoomComplete, roomReducer } from "@/features/game/view/room-state";
import { prefersReducedMotion } from "@/utils/motion";

interface Props {
  pool: PoolCard[];
  formation: Formation;
  seed: number;
  onComplete: (cardIds: PlayerSeasonId[]) => void;
  /** Seconds before the room picks for you, or null to disable. Mirrors DecisionPrompt. */
  limit?: number | null;
  /** Candidates per round (TASK-1810). Defaults to the shipped five. */
  handSize?: DraftSpec["handSize"];
  /** Whether the board is navigable (TASK-1810). Defaults to the shipped free roam. */
  roam?: DraftSpec["roam"];
  /** Guarantee one strong card per hand (TASK-1810). */
  standout?: boolean;
  /** A player may be offered in at most one hand (TASK-1810). */
  onePerPlayer?: boolean;
  /** A filled slot cannot be reopened — the pick is final (TASK-1810). */
  lockPicks?: boolean;
}

/**
 * The Draft Room — concept 09 "Tactics Blueprint", animation 07 "Flip Reveal".
 *
 * A chalk pitch carries slot identity AND overall progress at once, so with free roam it
 * doubles as the navigation surface: every slot is clickable at any time, and re-opening
 * a filled one offers the identical five with the current pick marked.
 *
 * ⚠️ The hands are computed ONCE from `(pool, formation, seed)`. They do not depend on
 * which slots have been visited — that is what lets free roam and seed-sharing coexist.
 *
 * ⭐ TASK-1810 runs the SAME room as consecutive rounds for Legacy Club. Only two things
 * change — how many cards a hand holds, and whether the board is navigable — because
 * `roomReducer` already advances to the next unfilled slot on every pick. Sequential
 * progression was always the reducer's behaviour; free roam is the UI additionally
 * permitting the `open` action.
 */
export function DraftRoom({
  pool,
  formation,
  seed,
  onComplete,
  limit = 15,
  handSize = HAND_SIZE,
  roam = "free",
  standout = false,
  onePerPlayer = false,
  lockPicks = false,
}: Props) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();
  const hands = useMemo(
    () => roomDeals(pool, formation, seed, { handSize, standout, onePerPlayer }),
    [pool, formation, seed, handSize, standout, onePerPlayer],
  );
  const [state, dispatch] = useReducer(roomReducer, formation, createRoomState);
  const byId = useMemo(() => new Map(pool.map((c) => [c.cardId, c])), [pool]);

  // ⚠️ Guarded with a ref: `isRoomComplete` stays true for every subsequent render, and
  // handing the XI up twice would set the builder's slots twice.
  const handedOff = useRef(false);
  useEffect(() => {
    if (handedOff.current || !isRoomComplete(state)) return;
    handedOff.current = true;
    onComplete(state.picks as PlayerSeasonId[]);
  }, [state, onComplete]);

  const rows = Math.max(...formation.slots.map((s) => s.row));
  const open = state.open;
  const hand = open == null ? [] : hands[open];
  const editing = open != null && state.picks[open] != null;

  /**
   * Which round the coach is on, when the room runs sequentially.
   *
   * ⚠️ Counted from the FILLED PICKS rather than from `open + 1`. They agree while slots
   * fill in order, but `nextUnfilled` wraps, so deriving it from the open index would
   * count backwards the moment it ever did.
   */
  const round = state.picks.filter((p) => p != null).length + 1;

  const [left, setLeft] = useState<number | null>(limit);

  /**
   * ⚠️ The clock runs on UNFILLED slots only.
   *
   * Reviewing your own squad must not be punished by a countdown — a timer firing while
   * the coach compares two players he already owns reads as a bug. And ⚠️ the clock never
   * reaches the domain: a timeout PICKS a card, and that pick is the input, so a lapsed
   * timer is indistinguishable from a deliberate choice on replay.
   *
   * Extendable and disableable (`limit: null`) per WCAG 2.2.1, exactly like DecisionPrompt.
   */
  useEffect(() => {
    if (open == null || editing || limit == null) {
      setLeft(null);
      return;
    }
    setLeft(limit);
    const id = window.setInterval(() => setLeft((v) => (v == null ? null : v - 1)), 1000);
    return () => window.clearInterval(id);
  }, [open, editing, limit]);

  /**
   * ⚠️ The timeout dispatch lives in its OWN effect, keyed on the countdown. Firing it
   * from inside the interval callback would close over a stale `open` the moment the
   * coach clicks a different slot mid-count.
   */
  useEffect(() => {
    if (left == null || left > 0 || open == null) return;
    const best = hands[open].reduce((a, b) =>
      (b.ratings?.overall ?? 0) > (a.ratings?.overall ?? 0) ? b : a,
    );
    dispatch({ type: "pick", index: open, cardId: best.cardId });
  }, [left, open, hands]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h2 className="text-xl font-extrabold tracking-tight">{t("roomTitle")}</h2>

      <div className="mt-4 grid gap-5 md:grid-cols-[minmax(200px,300px)_1fr]">
        <div
          // Sequential rounds leave the board decorative — the round line below carries the
          // state, so exposing an empty group here would only add noise.
          role={roam === "free" ? "group" : undefined}
          aria-label={roam === "free" ? t("roomTitle") : undefined}
          className="border-border relative aspect-[3/4] rounded-md border bg-[#0e1a22]"
        >
          {formation.slots.map((s, i) => {
            const inRow = formation.slots.filter((x) => x.row === s.row).length;
            const picked = state.picks[i];
            const card = picked != null ? byId.get(picked) : undefined;
            const position = {
              left: `${(s.col / (inRow + 1)) * 100}%`,
              top: `${100 - (s.row / (rows + 1)) * 100}%`,
            };
            const face = card ? (card.ratings?.overall ?? 0) : s.role;
            const marker = `absolute grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-mono text-[9px] font-bold ${
              card ? "bg-amber-400 text-black" : "bg-slate-700 text-slate-300"
            } ${open === i ? "ring-2 ring-cyan-400" : ""}`;

            /**
             * ⛔ INERT SPANS, never disabled buttons.
             *
             * A sequential room does not let the coach choose a slot, so eleven buttons
             * would be eleven dead stops in the tab order leading nowhere — the same rule
             * that governs locked tiles on the mode gate. The board stays a progress
             * picture and `aria-hidden` keeps it out of the accessibility tree, because
             * "Round 4 of 11" says the identical thing in one string.
             */
            if (roam === "sequential") {
              return (
                <span
                  key={`${s.row}-${s.col}`}
                  aria-hidden="true"
                  style={position}
                  className={marker}
                >
                  {face}
                </span>
              );
            }

            /**
             * ⛔ A locked, filled slot becomes an inert span too — same rule, same reason.
             * With `lockPicks` the pick is final, so a filled slot has nothing to offer a
             * click; leaving it focusable would promise an action that does not exist.
             */
            if (lockPicks && card != null) {
              return (
                <span key={`${s.row}-${s.col}`} aria-hidden="true" style={position} className={marker}>
                  {face}
                </span>
              );
            }

            return (
              <button
                key={`${s.row}-${s.col}`}
                type="button"
                aria-current={open === i ? "true" : undefined}
                aria-label={t("roomSlot", { n: i + 1, total: formation.slots.length })}
                onClick={() => dispatch({ type: "open", index: i })}
                style={position}
                className={marker}
              >
                {face}
              </button>
            );
          })}
        </div>

        <div>
          {open == null ? (
            <p className="text-sm font-bold">{t("roomDone")}</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {roam === "sequential" ? (
                <p className="w-full text-sm font-extrabold">
                  {t("roomRound", { n: round, total: formation.slots.length })}
                </p>
              ) : null}
              <p className="w-full font-mono text-xs font-bold">
                {editing
                  ? t("roomEditing")
                  : left == null
                    ? t("roomNoTimer")
                    : t("roomTimeLeft", { s: left })}
              </p>
              {hand.map((c) => (
                <button
                  key={c.cardId}
                  type="button"
                  aria-label={`${c.name}, ${c.role}, rated ${c.ratings?.overall ?? 0}`}
                  onClick={() => dispatch({ type: "pick", index: open, cardId: c.cardId })}
                  className={`room-card border-border w-[104px] rounded-md border p-2 text-start ${
                    reduced ? "" : "[animation:room-flip-in_.42s_both]"
                  } ${state.picks[open] === c.cardId ? "ring-2 ring-cyan-400" : ""}`}
                >
                  <span className="block font-mono text-lg font-black">
                    {c.ratings?.overall ?? 0}
                  </span>
                  <span className="block font-mono text-[10px] opacity-70">{c.role}</span>
                  <span className="mt-1 block text-[11px] font-bold">{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
