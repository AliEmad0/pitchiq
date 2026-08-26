"use client";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { budgetView, canAfford, shortfall, type BudgetView } from "@/features/game/domain/budget";
import { priceLabel } from "@/features/game/domain/price-band";
import { pickBack } from "@/features/game/domain/card-design";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import { BENCH_SHAPE, FORMATIONS, type PoolCard } from "@/features/game/domain/chaos-draft";
import { canField, roomDeals } from "@/features/game/domain/draft-room";
import { canPlay } from "@/features/game/domain/eligibility";
import type { Formation } from "@/features/game/domain/formation";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import type { DraftSpec } from "@/features/game/domain/rule-packs";
import {
  createRoomState,
  isRoomComplete,
  roomReducer,
  type LockedPick,
} from "@/features/game/view/room-state";
import { useRival, type ChosenRival, type Difficulty } from "@/features/game/view/rival-choice";
import { randomSeed } from "@/features/game/view/seed";
import { Link } from "@/i18n/navigation";
import { prefersReducedMotion } from "@/utils/motion";
import { ClubCrest } from "./ClubCrest";
import { CardBack, PlayerCard } from "./PlayerCard";

/** The shape the picker opens on, resolved by NAME — the array's order is presentation. */
const DEFAULT_FORMATION = "4-4-2 Flat";

/** Grouping for the shape chips only. Nothing resolves a formation through these. */
const FAMILIES = [
  { labelKey: "formationBackFour", from: 0, to: 10 },
  { labelKey: "formationBackThree", from: 10, to: 16 },
  { labelKey: "formationHistoric", from: 16, to: 20 },
] as const;

/** One entry in the rival menu — the id and the name, nothing else. */
export interface ClubChoice {
  id: number;
  name: string;
}

interface Props {
  pool: PoolCard[];
  draft: DraftSpec;
  onConfirm: (
    players: PoolCard[],
    formation: Formation,
    rival: { setup: ChosenRival | null; difficulty: Difficulty },
  ) => void;
  /** Back to the club menu. A route, not a callback. */
  backHref?: string;
  /**
   * Every club he can choose to face (owner, 2026-08-19).
   *
   * ⚠️ Names only — 51 of them, not their squads. The chosen club's cards are FETCHED; see
   * `view/rival-choice.ts` for why a prop would put ~1.2 MB on the page.
   */
  rivals?: readonly ClubChoice[];
  /**
   * The icon placed in the XI before a card is drafted (Captain's Draft, TASK-1810).
   *
   * ⛔ He is NOT in `pool` — the pool is what the coach may draft, and offering the icon
   * back would let him field the same man twice. That makes this prop load-bearing in a
   * second, quieter way: `byId` is built from the pool, and the confirm effect bails when
   * a pick fails to resolve, so a captain missing from that map would block the finished
   * XI forever with no visible cause.
   */
  captain?: PoolCard;
  /** The club whose page this is, preselected so doing nothing plays the shipped match. */
  clubId?: number;
  /**
   * The pack's spending cap, in indexed euros (Budget Cap, TASK-1810). Absent = no budget,
   * and this screen renders exactly as Legacy and Captain's Draft have always rendered it.
   */
  budget?: number;
}

/**
 * TASK-1810 — the Legacy draft (owner-designed, 2026-08-18).
 *
 * A big landscape pitch is the whole screen. The coach locks a shape, then fills it one
 * position at a time: tap a spot, five cards turn over on a veil that CANNOT be dismissed,
 * and the tap that picks one is final. A filled spot carries the player's name and rating
 * on the pitch, and tapping it again shows that card on a veil that CAN be dismissed.
 *
 * ⚠️ This is a separate component from `DraftRoom` on purpose. The room is the free-roam,
 * five-card, timed board `/game/draft` ships, and TASK-1823's tests are its control — the
 * two mechanics differ in every interaction, so sharing one component would mean a prop for
 * each difference and a shipped surface at risk on every change.
 */
export function PitchDraft({
  pool,
  draft,
  onConfirm,
  backHref,
  rivals,
  clubId,
  captain,
  budget,
}: Props) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();

  /** Who he has chosen to face, and how hard they play. */
  const [rivalId, setRivalId] = useState<number | null>(clubId ?? null);
  const [difficulty, setDifficulty] = useState<Difficulty>("balanced");
  const rival = useRival(rivals != null && rivals.length > 0 ? rivalId : null);

  /**
   * Only shapes this club can field.
   *
   * ⚠️ `onePerPlayer` collapses a club to its distinct players, and five one-or-two-season
   * clubs cannot fill every formation — Barnsley strands three slots of a 2-3-5 Pyramid.
   * A shape that cannot be completed would deadlock the draft with no way out.
   */
  const shapes = useMemo(() => {
    const fieldable =
      draft.onePerPlayer === true ? FORMATIONS.filter((f) => canField(pool, f)) : FORMATIONS;
    // ⚠️ A shape with nowhere to put the captain would be undraftable: he cannot be
    // dropped (the mode is built on him) and he cannot be placed. 4-6-0 Strikerless has no
    // centre-forward slot, so a striker icon must not be offered it.
    return captain == null
      ? fieldable
      : fieldable.filter((f) => f.slots.some((sl) => canPlay(captain, sl.role)));
  }, [pool, draft.onePerPlayer, captain]);

  /** Where the captain stands in a given shape — his first eligible slot, in slot order. */
  const lockedFor = useCallback(
    (f: Formation): LockedPick | null => {
      if (captain == null) return null;
      const index = f.slots.findIndex((sl) => canPlay(captain, sl.role));
      return index < 0 ? null : { index, cardId: captain.cardId };
    },
    [captain],
  );

  const [shape, setShape] = useState<Formation>(
    () => shapes.find((f) => f.name === DEFAULT_FORMATION) ?? shapes[0]!,
  );
  /** Drawn when the shape is locked, never during render — the route is `force-static`. */
  const [seed, setSeed] = useState<number | null>(null);
  // ⚠️ Lazy init with BOTH arguments — `useReducer(reducer, shape, createRoomState)` can
  // only ever pass one, so the captain would never be placed on the first render.
  /** The bench roles this pack drafts, or none. `BENCH_SHAPE` opens with a keeper. */
  const benchRoles = useMemo(() => (draft.bench === true ? BENCH_SHAPE : []), [draft.bench]);
  const [state, dispatch] = useReducer(roomReducer, undefined, () =>
    createRoomState(shape, lockedFor(shape), benchRoles),
  );
  /** Which veil is up. `null` is the bare pitch. */
  const [veil, setVeil] = useState<{ slot: number; mode: "round" | "review" } | null>(null);

  const locked = seed != null;
  const hands = useMemo(
    () =>
      seed == null
        ? []
        : roomDeals(pool, shape, seed, {
            handSize: draft.handSize,
            standout: draft.standout,
            cheapest: draft.cheapest,
            bench: benchRoles,
            onePerPlayer: draft.onePerPlayer,
            // ⛔ He is in the pool so every replay path can resolve him; he must not be
            // dealt, or the coach could field the same man twice.
            excludePlayers: captain == null ? undefined : new Set([captain.playerId]),
          }),
    [
      pool,
      shape,
      seed,
      draft.handSize,
      draft.standout,
      draft.cheapest,
      draft.onePerPlayer,
      benchRoles,
      captain,
    ],
  );

  /** ⛔ The captain is in here, though he is not in the pool. See the `captain` prop. */
  const byId = useMemo(
    () => new Map([...pool, ...(captain != null ? [captain] : [])].map((c) => [c.cardId, c])),
    [pool, captain],
  );
  const filled = state.picks.filter((p) => p != null).length;

  /**
   * The running budget — DERIVED on every render, never stored.
   *
   * ⚠️ `RoomState` holds only `picks`; spend, reserve and ceiling are recomputed from the
   * picks and the dealt hands, the same way the daily challenge derives streaks rather than
   * persisting them. See `domain/budget.ts` for why the reserve reads the HANDS, not the pool.
   *
   * ⚠️ The OPEN slot is the one on the veil while a round is up, because that is the pick the
   * ceiling is about. Off the veil it is the reducer's own open slot.
   */
  const openSlot = veil?.mode === "round" ? veil.slot : state.open;

  /**
   * The role a room index is drafting — the formation's slots first, then the bench.
   *
   * ⛔ NEVER `shape.slots[i].role` on its own. A bench index is past the end of an eleven-slot
   * formation, so that returns `undefined` and `.role` throws — which crashed the whole draft
   * screen the moment the first bench slot was opened. The browser found it; nothing else did.
   */
  const roleAt = useCallback(
    (i: number) => shape.slots[i]?.role ?? benchRoles[i - shape.slots.length] ?? "CM",
    [shape, benchRoles],
  );
  const view = useMemo(
    () => (budget == null ? null : budgetView(hands, state.picks, budget, openSlot)),
    [budget, hands, state.picks, openSlot],
  );
  /**
   * ⚠️ Western digits, like the card badge beside it. The card face is English-only in every
   * locale, so localising the meter alone would put two numeral systems side by side for one
   * currency — the exact inconsistency TASK-1840 was opened to remove.
   */
  const money = useCallback((tenths: number) => priceLabel(tenths), []);

  /**
   * The spend line — concept 10 "Countdown" (owner's pick, 2026-08-26).
   *
   * ⭐ The WALLET counts down and spend is secondary, because "what have I got left" is the
   * question a coach actually asks mid-draft. The first version gave equal weight to spent /
   * remaining / ceiling, which left the number that actually gates the cards the hardest of
   * the three to find.
   *
   * ⚠️ The bar shows the CEILING as a share of the whole budget, not spend as a share — it is
   * the headroom that closes as the draft tightens, and watching it close is the feedback.
   *
   * ⚠️ Rendered on the pitch AND on the veil, which covers the pitch. A meter that lived only
   * on the veil would vanish between rounds, exactly when the coach reviews the XI so far.
   */
  const meter = (v: BudgetView) => {
    const total = v.spent + v.remaining;
    const spentPct = total > 0 ? Math.max(0, Math.min(100, (v.spent / total) * 100)) : 0;
    const left = state.picks.filter((p) => p == null).length;
    return (
      <div
        data-testid="budget-meter"
        className="mx-auto w-full max-w-md rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3"
      >
        <div className="flex items-baseline justify-center gap-2">
          <span className="font-mono text-4xl leading-none font-extrabold tracking-tight">
            £{money(v.remaining)}m
          </span>
          <span className="text-[10px] font-bold tracking-[0.09em] uppercase opacity-70">
            {t("budgetRemaining")}
          </span>
        </div>
        {/* ⛔ The bar tracks SPEND, so it starts EMPTY. It showed the ceiling as a share of the
            budget, which begins near 60% and was read — correctly — as "half my money is
            already gone" before a single pick. A meter that has to be explained is wrong. */}
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#12222c]">
          <div
            data-testid="budget-spent-bar"
            className="h-full rounded-full bg-emerald-400 transition-[width] duration-300"
            style={{ width: `${spentPct}%` }}
          />
        </div>
        <p className="mt-2 text-center font-mono text-[11px] opacity-70">
          {t("budgetSpendableNow", { amount: `£${money(Math.max(0, v.ceiling))}m` })}
        </p>
        {/* ⚠️ Says WHY the spendable figure is below the balance. Without it the two numbers
            look like a contradiction, which is exactly how the first version read. */}
        {left > 1 ? (
          <p className="mt-0.5 text-center text-[10px] opacity-55">
            {t("budgetHeldBack", { amount: `£${money(v.reserve)}m`, count: left - 1 })}
          </p>
        ) : null}
      </div>
    );
  };

  /** The drafted squad, in slot order then bench order, or null while it is incomplete. */
  const squad = useMemo(() => {
    if (!locked || !isRoomComplete(state)) return null;
    const players = state.picks
      .map((id) => (id != null ? byId.get(id) : undefined))
      .filter((c): c is PoolCard => c != null);
    return players.length === state.picks.length ? players : null;
  }, [locked, state, byId]);

  const handOff = useCallback(() => {
    if (squad == null) return;
    // ⚠️ `null` when the fetch never landed — the match is played against the coach's own
    // pool rather than blocked. See `RivalState`.
    onConfirm(squad, shape, {
      setup: rival.status === "ready" ? rival.rival : null,
      difficulty,
    });
  }, [squad, onConfirm, shape, rival, difficulty]);

  /**
   * Hand the finished squad up as soon as it is complete — UNLESS the pack asks to confirm.
   *
   * ⭐ Budget Cap sets `confirm` (owner, 2026-08-26): the whole activity is trying
   * combinations until the money works, so handing off on the sixteenth pick would end the
   * draft at the exact moment the coach wants to start swapping.
   *
   * ⚠️ Every other pack keeps the shipped auto-handoff, which is why this is a pack field and
   * not a change to the behaviour itself.
   */
  useEffect(() => {
    if (draft.confirm === true || squad == null) return;
    handOff();
  }, [draft.confirm, squad, handOff]);

  const previewShape = (f: Formation) => {
    if (locked) return;
    setShape(f);
    // The captain's slot is re-derived for the new shape — an index belongs to a formation.
    dispatch({ type: "setFormation", formation: f, locked: lockedFor(f) });
  };

  /**
   * Move the captain to another slot he can play (owner, 2026-08-25).
   *
   * ⚠️ Only before the shape is locked, and only to a slot `canPlay` accepts — his main
   * role or one of his `altRoles`. The mode is built on him, so where he stands is the
   * coach's first tactical decision rather than whichever eligible slot came first in
   * slot order.
   *
   * ⚠️ No new state: `state.locked` already records his slot, so this is the same
   * `setFormation` the shape picker dispatches, with a different index.
   */
  const moveCaptain = (index: number) => {
    if (locked || captain == null) return;
    dispatch({ type: "setFormation", formation: shape, locked: { index, cardId: captain.cardId } });
  };
  /** Slots the captain may stand in — his role and his alternates. */
  const canHoldCaptain = (role: Formation["slots"][number]["role"]) =>
    captain != null && canPlay(captain, role);

  const rows = Math.max(...shape.slots.map((s) => s.row));
  const veilCards: PoolCard[] =
    veil == null
      ? []
      : veil.mode === "round"
        ? (hands[veil.slot] ?? [])
        : [byId.get(state.picks[veil.slot] as PlayerSeasonId)].filter(
            (c): c is PoolCard => c != null,
          );

  return (
    <div className={`pd-root${locked ? "" : " pd-shaping"}`}>
      {/* ⭐ ABOVE the pitch (owner, 2026-08-26) — it is the first thing to read, and under the
          pitch it sat below the fold on a laptop while every decision on screen depended on
          it. ⚠️ Rendered here AND on the veil, because the veil covers the pitch entirely. */}
      {locked && view != null ? <div className="mb-4">{meter(view)}</div> : null}

      <div className="pd-pitch-wrap">
        {/* ⛔ `dir="ltr"`, deliberately, and the ONE place in the app that opts out of RTL
            (owner's call, 2026-08-19). A football pitch is not text: its markings are drawn
            with PHYSICAL properties (`.pd-box-left` / `.pd-box-right`, the halfway line) and
            a spot is centred with a physical `translate(-50%, -50%)`, while the spots
            themselves were placed with `inset-inline-start`. Under `/ar` only the spots
            mirrored — the goalmouths stayed put and the centring shifted the wrong way — so
            the keeper stood in the centre circle and the forwards on their own goal line.
            Pinning the pitch to one direction makes both locales render the identical
            layout; the labels on it are player names, which do not localize either. */}
        <div className="pd-pitch" dir="ltr">
          <span className="pd-box pd-box-left" />
          <span className="pd-box pd-box-left pd-box-six" />
          <span className="pd-box pd-box-right" />
          <span className="pd-box pd-box-right pd-box-six" />

          {shape.slots.map((s, i) => {
            const inRow = shape.slots.filter((x) => x.row === s.row).length;
            const id = state.picks[i];
            const card = id != null ? byId.get(id) : undefined;
            // row → across the pitch (goal to attack), col → up and down.
            const style = {
              insetInlineStart: `${(s.row / (rows + 1)) * 100}%`,
              top: `${(s.col / (inRow + 1)) * 100}%`,
            };
            // Before the shape is locked, a slot the captain can play is a MOVE target.
            const movable = !locked && canHoldCaptain(s.role) && state.locked !== i;
            const label = movable
              ? t("pitchMoveCaptain", { role: s.role, name: captain!.name })
              : card
                ? t("pitchViewPick", {
                    role: s.role,
                    name: card.name,
                    ovr: card.ratings?.overall ?? 0,
                  })
                : t("pitchFillSlot", { role: s.role });

            return (
              <button
                key={`${s.row}-${s.col}`}
                type="button"
                style={style}
                disabled={!locked && !movable}
                aria-label={label}
                onClick={() =>
                  movable
                    ? moveCaptain(i)
                    : setVeil({
                        slot: i,
                        // ⭐ A filled slot re-opens its HAND when picks are not final, so the
                        // coach can swap a man out to afford someone else. With `lockPicks`
                        // it stays a read-only look at the card he already chose.
                        mode: card && draft.lockPicks === true ? "review" : "round",
                      })
                }
                className={`pd-spot${movable ? " pd-movable" : ""}${card ? " pd-filled" : ""}${
                  card && (card.ratings?.overall ?? 0) < 80 ? " pd-silver" : ""
                }`}
              >
                <span className="pd-disc">{card ? (card.ratings?.overall ?? 0) : s.role}</span>
                {card ? <span className="pd-tag">{card.name}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* ⛔ Not dismissable: no close control, and the veil ignores clicks on itself. */}
      {locked ? null : (
        <div
          className="pd-shapebar"
          role="dialog"
          aria-modal="true"
          aria-label={t("pitchShapeTitle")}
        >
          <div className="pd-shapebar-inner">
            <h2 className="text-base font-extrabold tracking-tight">{t("pitchShapeTitle")}</h2>
            <p className="text-muted-foreground mb-3 mt-0.5 text-xs">{t("pitchShapeHint")}</p>
            {FAMILIES.map(({ labelKey, from, to }) => {
              const group = FORMATIONS.slice(from, to).filter((f) =>
                shapes.some((x) => x.name === f.name),
              );
              return group.length === 0 ? null : (
                <div key={labelKey} className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground w-full font-mono text-[10px] uppercase tracking-widest">
                    {t(labelKey)}
                  </span>
                  {group.map((f) => (
                    <button
                      key={f.name}
                      type="button"
                      aria-pressed={f.name === shape.name}
                      onClick={() => previewShape(f)}
                      className="pd-chip"
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              );
            })}
            {/* ---- who you face (owner, 2026-08-19) ---- */}
            {rivals != null && rivals.length > 0 ? (
              <div className="pd-rival">
                <label className="pd-rival-field">
                  <span className="pd-rival-label">{t("rivalPick")}</span>
                  {/* The crest sits BESIDE the select, not inside it — an <option> cannot
                      carry an image, and a club is far quicker to recognise by its badge
                      than by reading a name out of a list of fifty-one. */}
                  <span className="pd-select-wrap">
                    <ClubCrest teamId={rivalId} size={26} />
                    <select
                      className="pd-select"
                      value={rivalId ?? ""}
                      onChange={(e) => setRivalId(Number(e.target.value))}
                    >
                      {rivals.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.id === clubId ? t("rivalOwnClub", { name: c.name }) : c.name}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>

                <div className="pd-rival-field">
                  <span className="pd-rival-label">{t("rivalDifficulty")}</span>
                  {/* A radio GROUP, not two buttons: these are two states of one setting and
                      a screen reader must hear them that way. */}
                  <div role="radiogroup" aria-label={t("rivalDifficulty")} className="pd-diffs">
                    {(["balanced", "best"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        role="radio"
                        aria-checked={difficulty === d}
                        onClick={() => setDifficulty(d)}
                        className={`pd-diff${difficulty === d ? " pd-diff-on" : ""}`}
                      >
                        {t(d === "best" ? "rivalBest" : "rivalBalanced")}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ⚠️ Announced, never blocking. A slow or failed fetch still lets him lock
                    in and play — against his own club's pool, which is what the mode did
                    before a rival could be chosen at all. */}
                <p className="pd-rival-note" role="status">
                  {rival.status === "loading"
                    ? t("rivalLoading")
                    : rival.status === "unavailable"
                      ? t("rivalUnavailable")
                      : t("rivalReady", {
                          name: rival.rival.name,
                          n: rival.rival.cards.length,
                        })}
                </p>
              </div>
            ) : null}

            <div className="pd-confirm">
              <span className="text-muted-foreground font-mono text-[11px]">
                {t("pitchShapeFinal")}
              </span>
              <div className="flex items-center gap-2">
                {backHref != null ? (
                  <Link
                    href={backHref}
                    className="border-border rounded-md border px-4 py-2 text-sm font-semibold"
                  >
                    {/* ⚠️ The label names what you would go BACK to choose, and this
                        route serves more than clubs now (owner, 2026-08-25). */}
                    {t(captain != null ? "modeBackCaptain" : "modeBack")}
                  </Link>
                ) : null}
                <button type="button" onClick={() => setSeed(randomSeed())} className="pd-lock">
                  {t("pitchLockIn", { name: shape.name })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {veil != null ? (
        <div
          className="pd-veil"
          role="dialog"
          aria-modal="true"
          aria-label={
            veil.mode === "round"
              ? t("pitchChooseRole", { role: roleAt(veil.slot) })
              : t("pitchYourPick", { role: roleAt(veil.slot) })
          }
          // ⛔ A ROUND cannot be dismissed by clicking away; a review can.
          onClick={(e) => {
            if (veil.mode === "review" && e.target === e.currentTarget) setVeil(null);
          }}
        >
          <div className="pd-veil-inner">
            <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
              {veil.mode === "round"
                ? t("pitchChooseRole", { role: roleAt(veil.slot) })
                : t("pitchYourPick", { role: roleAt(veil.slot) })}
            </h2>
            <p className="text-muted-foreground mb-6 mt-1 text-sm">
              {veil.mode === "round" ? t("pitchRoundHint") : t("pitchPickFinal")}
            </p>

            {view != null && veil.mode === "round" ? (
              <div className="mb-5">{meter(view)}</div>
            ) : null}

            <div className="pd-hand" key={`${veil.slot}-${veil.mode}`}>
              {veilCards.map((c, k) => (
                <div
                  key={c.cardId}
                  data-testid="pd-candidate"
                  /**
                   * ⛔ Dealt but DISABLED, never filtered out (owner, 2026-08-25). Seeing the
                   * €200M card you are priced out of is the mode working; removing it from the
                   * hand would make the budget invisible and spending big consequence-free.
                   *
                   * ⚠️ The reserve rule guarantees the cheapest card in this hand is always
                   * affordable, so a hand can never be entirely dead — see `domain/budget.ts`.
                   */
                  data-unaffordable={
                    view != null && veil.mode === "round" && !canAfford(c, view) ? "" : undefined
                  }
                  className={`pd-card${
                    view != null && veil.mode === "round" && !canAfford(c, view)
                      ? " opacity-45 grayscale"
                      : ""
                  }`}
                  style={{ ["--pd-i" as string]: reduced ? 0 : k }}
                >
                  {/* TASK-1837 — the card's OWN back, seeded per card exactly as a tap
                      flip picks it, so a face-down card is never a generic grey panel. */}
                  <span className="pd-back" aria-hidden="true">
                    <CardBack card={c as EnrichedCard} back={pickBack(c as EnrichedCard)} />
                  </span>
                  <span className="pd-front">
                    <PlayerCard card={c as EnrichedCard} reduced={reduced} interactive={false} />
                  </span>
                  {veil.mode === "round" ? (
                    // The ONLY control on a card, and it sits outside the turning faces:
                    // a rotated, backface-hidden surface does not hit-test reliably.
                    <button
                      type="button"
                      className="pd-pick"
                      disabled={view != null && !canAfford(c, view)}
                      aria-label={
                        view != null && !canAfford(c, view)
                          ? `${t("pitchChooseCard", {
                              name: c.name,
                              role: c.role ?? roleAt(veil.slot),
                              ovr: c.ratings?.overall ?? 0,
                            })} — ${t("budgetShortfall", { amount: `£${money(shortfall(c, view))}m` })}`
                          : t("pitchChooseCard", {
                              name: c.name,
                              // A card's own role is nullable in the data; the SLOT's never is,
                              // and it is the role being filled that the label is about.
                              role: c.role ?? roleAt(veil.slot),
                              ovr: c.ratings?.overall ?? 0,
                            })
                      }
                      onClick={() => {
                        dispatch({ type: "pick", index: veil.slot, cardId: c.cardId });
                        setVeil(null);
                      }}
                    />
                  ) : null}
                </div>
              ))}
            </div>

            {veil.mode === "round" ? (
              <p className="text-muted-foreground mt-6 font-mono text-[11px]">
                {t("pitchNoTimer")}
              </p>
            ) : (
              <button type="button" onClick={() => setVeil(null)} className="pd-close">
                {t("pitchClose")}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* The bench, as its own strip — five more slots the coach drafts and pays for. */}
      {locked && benchRoles.length > 0 ? (
        <div className="mt-5">
          <p className="text-muted-foreground mb-2 text-center font-mono text-[11px] tracking-wider uppercase">
            {t("pitchBench")}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {benchRoles.map((role, i) => {
              const index = shape.slots.length + i;
              const id = state.picks[index];
              const card = id != null ? byId.get(id) : undefined;
              return (
                <button
                  key={`${role}-${i}`}
                  type="button"
                  aria-label={
                    card
                      ? t("pitchViewPick", {
                          role,
                          name: card.name,
                          ovr: card.ratings?.overall ?? 0,
                        })
                      : t("pitchFillSlot", { role })
                  }
                  onClick={() =>
                    setVeil({
                      slot: index,
                      mode: card && draft.lockPicks === true ? "review" : "round",
                    })
                  }
                  className={`min-w-[92px] rounded-md border px-3 py-2 text-center font-mono text-[11px] ${
                    card
                      ? "border-amber-400/60 bg-amber-400/10"
                      : "border-dashed border-white/25 opacity-70"
                  }`}
                >
                  <span className="block text-[9px] tracking-wider opacity-70">{role}</span>
                  <span className="block font-bold">
                    {card ? (card.ratings?.overall ?? 0) : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {locked ? (
        <p className="text-muted-foreground mt-5 text-center font-mono text-xs">
          {/* ⚠️ Counts the WHOLE squad, not the XI — with a bench, "9 of 11" beside five empty
              bench slots would be telling the coach he is nearly done when he is not. */}
          {t("pitchProgress", { filled, total: state.picks.length })}
        </p>
      ) : null}

      {/* ⭐ The coach says when he is done (owner, 2026-08-26). Disabled until the squad is
          complete, so the button states the remaining work rather than hiding it. */}
      {locked && draft.confirm === true ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            data-testid="confirm-squad"
            disabled={squad == null}
            onClick={handOff}
            className="rounded-lg bg-emerald-400 px-8 py-3 text-sm font-extrabold text-[#06231a] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {squad == null
              ? t("pitchConfirmPending", { count: state.picks.length - filled })
              : t("pitchConfirmSquad")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
