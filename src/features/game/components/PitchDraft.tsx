"use client";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { budgetView, canAfford, shortfall, type BudgetView } from "@/features/game/domain/budget";
import { priceLabel } from "@/features/game/domain/price-band";
import { pickBack } from "@/features/game/domain/card-design";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import { BENCH_SHAPE, FORMATIONS, type PoolCard } from "@/features/game/domain/chaos-draft";
import { chemistry, chemistryBreakdown, linkTier } from "@/features/game/domain/chemistry";
import { continentOf, ringOf, type Ring } from "@/features/game/domain/continents";
import { canField, redealHands, roomDeals } from "@/features/game/domain/draft-room";
import { canPlay } from "@/features/game/domain/eligibility";
import type { Formation } from "@/features/game/domain/formation";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { adjacentPairs } from "@/features/game/domain/pitch-adjacency";
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
import { countryNameFromCode } from "@/utils/country";
import { prefersReducedMotion } from "@/utils/motion";
import { Flag } from "@/features/players/components/Flag";
import { ClubCrest } from "./ClubCrest";
import { CardBack, PlayerCard } from "./PlayerCard";

/** The shape the picker opens on, resolved by NAME — the array's order is presentation. */
const DEFAULT_FORMATION = "4-4-2 Flat";

/** "2004-05" — how every card face already writes a season. */
const seasonLabel = (season: number) => `${season}-${String((season + 1) % 100).padStart(2, "0")}`;

/** Grouping for the shape chips only. Nothing resolves a formation through these. */
const FAMILIES = [
  { labelKey: "formationBackFour", from: 0, to: 10 },
  { labelKey: "formationBackThree", from: 10, to: 16 },
  { labelKey: "formationHistoric", from: 16, to: 20 },
] as const;

/** One entry in the rival menu — the id and the name, nothing else. */
export interface ClubChoice {
  /** A club's numeric id, or a NATION's flag-icons code (TASK-1842) - the rival route
   *  serves both from one namespace, and codes are non-numeric so they cannot collide. */
  id: number | string;
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
  /**
   * The chosen nation's flag-icons code (TASK-1842). Present only for the Nationality
   * Draft: it turns on the widening-ring deal, the ring line under a widened round's
   * heading, and the ring chip on non-countryman cards. Absent = every ring surface is
   * inert and the deal is byte-identical to before the mode existed.
   */
  nation?: string;
  /**
   * Score this XI on its LINKS and draw them on the pitch (Chemistry Draft, TASK-1810 PR 5).
   * Absent = no connectors, no meter, no deltas — every other pack renders untouched.
   */
  chemistry?: boolean;
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
  nation,
  chemistry: chemistryOn,
}: Props) {
  const t = useTranslations("game");
  const locale = useLocale();
  const reduced = prefersReducedMotion();

  /** Who he has chosen to face, and how hard they play. */
  // A nation draft opens on ITSELF - Egypt v Egypt is the natural exhibition, exactly as
  // a club page opens on its own club (TASK-1842).
  const [rivalId, setRivalId] = useState<number | string | null>(clubId ?? nation ?? null);
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
        : draft.redeal === true
          ? /**
             * TASK-1842 - hands recomputed from the CURRENT picks, so an unpicked candidate
             * returns to later rounds (Egypt's three CMs must all stay drawable until each
             * is actually taken). Recomputes on every pick; the per-slot streams keep every
             * untouched hand byte-stable. See `redealHands` for the visit-order trade.
             */
            redealHands(pool, shape, seed, state.picks, {
              handSize: draft.handSize,
              onePerPlayer: draft.onePerPlayer,
              bench: benchRoles,
              excludePlayers: captain == null ? undefined : new Set([captain.playerId]),
              rings: nation == null ? undefined : { nation },
            })
          : roomDeals(pool, shape, seed, {
              handSize: draft.handSize,
              standout: draft.standout,
              cheapest: draft.cheapest,
              bench: benchRoles,
              onePerPlayer: draft.onePerPlayer,
              // ⛔ He is in the pool so every replay path can resolve him; he must not be
              // dealt, or the coach could field the same man twice.
              excludePlayers: captain == null ? undefined : new Set([captain.playerId]),
              // TASK-1842 — each hand narrows to the widest ring it needs, nation first.
              rings: nation == null ? undefined : { nation },
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
      nation,
      draft.redeal,
      // Read by the redeal path only - a conditional dep list is not a thing React has,
      // and for every other pack a pick re-runs a memo whose roomDeals inputs are
      // unchanged, recomputing the identical hands.
      state.picks,
    ],
  );

  /** ⛔ The captain is in here, though he is not in the pool. See the `captain` prop. */
  const byId = useMemo(
    () => new Map([...pool, ...(captain != null ? [captain] : [])].map((c) => [c.cardId, c])),
    [pool, captain],
  );
  const filled = state.picks.filter((p) => p != null).length;
  /** How much of the BENCH is done — its own count, because it is its own strip. */
  const benchFilled = benchRoles.reduce(
    (n, _role, i) => n + (state.picks[shape.slots.length + i] != null ? 1 : 0),
    0,
  );

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
   * The man already standing in the slot the veil is over, if there is one.
   *
   * ⭐ A round opened on a FILLED slot is a different interaction from a round opened on an
   * empty one, and treating them as the same thing is what dead-ended the mode. The coach
   * chose to reconsider, so he must be able to walk away; and the card he already owns is a
   * CONTROL on that veil — tapping it drops the man rather than buying him twice.
   */
  const openPick = veil != null ? (state.picks[veil.slot] ?? null) : null;

  /**
   * ⛔ Whether a round can be walked away from — derived from the PACK, never from a mode id.
   *
   * Legacy Club and Captain's Draft lock their picks: there the round IS the commitment
   * ("five cards turn over on a veil that CANNOT be dismissed"), and that rule is theirs to
   * keep. Budget Cap does not lock them — nothing is final until the coach confirms the
   * squad — so a round he can neither answer nor leave is the mode contradicting its own
   * premise. It shipped that way, and with a full squad and £1.2m of change it left no way
   * out of the page at all.
   */
  const picksAreFinal = draft.lockPicks === true;
  const canLeaveRound = !picksAreFinal;
  const dismissable = veil != null && (veil.mode === "review" || canLeaveRound);

  /**
   * ⛔ EVERY SENTENCE ON A ROUND IS KEYED ON THE PACK FIELD THAT MAKES IT TRUE.
   *
   * TASK-1836's rule — "copy that outruns the rules is a lie the player can check" — and #199
   * broke it by REWRITING the two shared strings for Budget Cap **in place** rather than
   * adding pack-specific ones. Legacy Club and Captain's Draft were left telling the coach he
   * could "change his mind until you confirm" and "swap anyone out until the squad and the
   * money both work", on a screen that has no confirm button, no swap, and no money at all.
   * The strings they overwrote had been correct for Legacy for months.
   *
   * ⚠️ The 80+ promise is keyed on `standout`, NOT on `lockPicks`. All three shipped packs
   * have those two flags equal — Legacy and Captain's true/true, Budget false/absent — so
   * folding the sentence into the finality string would be ACCIDENTALLY correct today, and a
   * lie the day a pack ships `lockPicks: true` with no standout, which is a legal spec.
   *
   * ⚠️ "Five" is still a literal against `draft.handSize`, which is 5 in every shipped pack.
   * Left alone deliberately: parameterising it costs an ICU plural in a locale with six plural
   * forms, to guard a pack that does not exist. Revisit if one ever deals a different hand.
   */
  const roundHint = [
    picksAreFinal ? t("pitchRoundFinalHint") : t("pitchRoundHint"),
    draft.standout === true ? t("pitchRoundStandout") : null,
  ]
    .filter((s): s is string => s != null)
    .join(" ");

  // The third way out, matching `BenchDialog`: backdrop, button, Escape.
  useEffect(() => {
    if (!dismissable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVeil(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissable]);

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

  /**
   * The chemistry view (TASK-1810 PR 5) — the placed XI, its score, and every link.
   *
   * Derived on every render from the picks, exactly as the budget meter is: `RoomState` holds
   * only `picks`, and a score kept in state would be one more thing that can disagree with
   * the board. `chemistry()` is pure and cheap over ~20 pairs.
   */
  const placedXi =
    chemistryOn === true
      ? state.picks
          .slice(0, shape.slots.length)
          .map((id) => (id != null ? byId.get(id) : undefined))
      : null;
  const chemScore = placedXi == null ? 0 : chemistry(placedXi, shape);
  const chemCounts = placedXi == null ? null : chemistryBreakdown(placedXi, shape);

  /**
   * What a candidate would ADD to the open slot, in chemistry points.
   *
   * The trade-off made visible, and the reason the mode is a decision rather than "pick the
   * highest number": chasing chemistry costs ~6.8 rating points per player, so the coach has
   * to be able to see what he is buying. The 84 countryman beside the 91 stranger.
   *
   * Scored against the CURRENT placement and this slot only, so it is honest about the pick
   * being made rather than estimating a finished side. Zero on the first pick of an empty
   * pitch, because a card with no placed neighbours genuinely links to nothing.
   */
  const chemDelta = (slot: number, candidate: PoolCard): number => {
    if (placedXi == null || slot >= placedXi.length) return 0;
    const withCard = [...placedXi];
    withCard[slot] = candidate;
    const without = [...placedXi];
    without[slot] = undefined;
    return chemistry(withCard, shape) - chemistry(without, shape);
  };

  /**
   * One connector per adjacent pair, carrying its tier.
   *
   * ⚠️ The graph is drawn WHOLE — an unlinked pair renders at rest rather than vanishing —
   * so the coach can see where a link is missing, which is the half of the information that
   * tells him what to do next.
   */
  const chemLinks =
    placedXi == null
      ? []
      : adjacentPairs(shape).map(([i, j]) => {
          const a = placedXi[i];
          const b = placedXi[j];
          const tier = a != null && b != null ? linkTier(a, b) : "none";
          const title =
            tier === "teammates" && a != null
              ? t("chemLinkTeammates", { club: a.club, season: seasonLabel(a.season) })
              : tier === "club" && a != null
                ? t("chemLinkClub", { club: a.club })
                : tier === "nation" && a != null
                  ? // ⚠️ The COUNTRY's name, resolved from the code per locale — an English
                    // name on /ar is the M89 class of bug. Falls back to the raw code only
                    // when Intl cannot resolve it.
                    t("chemLinkNation", {
                      nation:
                        countryNameFromCode(a.nationalityCode, locale) ?? a.nationalityCode ?? "",
                    })
                  : null;
          return { i, j, tier, title };
        });

  /** The card the coach is holding in the open slot — the one his taps can now DROP. */
  const currentCard = openPick != null ? byId.get(openPick) : undefined;

  /**
   * What the veil is: a fresh round, a SWAP on a slot he has already filled, or a read-only
   * look at a final pick. ⚠️ "Choose your CF" over a slot that already holds a centre-forward
   * is half of why the screen read as stuck — it never acknowledged the man standing there.
   */
  const veilTitle =
    veil == null
      ? ""
      : veil.mode === "review"
        ? t("pitchYourPick", { role: roleAt(veil.slot) })
        : currentCard != null
          ? t("pitchChangeRole", { role: roleAt(veil.slot) })
          : t("pitchChooseRole", { role: roleAt(veil.slot) });

  const veilCards: PoolCard[] =
    veil == null
      ? []
      : veil.mode === "round"
        ? (hands[veil.slot] ?? [])
        : [byId.get(state.picks[veil.slot] as PlayerSeasonId)].filter(
            (c): c is PoolCard => c != null,
          );

  /**
   * Which ring this round's hand was dealt from (TASK-1842) — null off the Nationality
   * Draft, and null for a countryman hand, so every other pack renders exactly as before.
   *
   * ⚠️ Read off the FIRST card, which is sound because the deal narrows a hand to a single
   * ring before drawing — a property `game-draft-room.test.ts` pins. The ring must be
   * VISIBLE: a card silently arriving from "Africa" while the coach thinks he is drafting
   * Egyptians breaks the mode's premise without him knowing (the ticket's own words).
   */
  const handRing: Ring | null =
    nation != null && veil?.mode === "round" && veilCards.length > 0
      ? ringOf(veilCards[0]!, nation)
      : null;
  const nationName = nation != null ? countryNameFromCode(nation, locale) : null;
  const continentKey = (() => {
    const c = nation != null ? continentOf(nation) : null;
    return c == null
      ? null
      : (
          {
            eu: "continentEu",
            af: "continentAf",
            as: "continentAs",
            na: "continentNa",
            sa: "continentSa",
            oc: "continentOc",
          } as const
        )[c];
  })();

  return (
    <div className={`pd-root${locked ? "" : " pd-shaping"}`}>
      {/* ⭐ ABOVE the pitch (owner, 2026-08-26) — it is the first thing to read, and under the
          pitch it sat below the fold on a laptop while every decision on screen depended on
          it. ⚠️ Rendered here AND on the veil, because the veil covers the pitch entirely. */}
      {locked && view != null ? <div className="mb-4">{meter(view)}</div> : null}

      {/* ⭐ The chemistry meter, in the idiom Budget Cap's "Countdown" established: the score
          as the hero number, a bar, and the tiers spelled out in WORDS beneath — which is
          what makes the number explicable rather than a verdict, and what keeps the three
          link states legible without colour vision. */}
      {locked && chemCounts != null ? (
        <div
          data-testid="chem-meter"
          className="border-border bg-muted/30 mx-auto mb-4 w-full max-w-md rounded-lg border px-4 py-3"
        >
          <div className="flex items-baseline justify-center gap-2">
            <span className="font-mono text-4xl leading-none font-extrabold tracking-tight">
              {chemScore}
            </span>
            <span className="text-[10px] font-bold tracking-[0.09em] uppercase opacity-70">
              {t("chemScore")}
            </span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#12222c]">
            <div
              data-testid="chem-bar"
              className="h-full rounded-full bg-sky-400 transition-[width] duration-300"
              style={{ width: `${chemScore}%` }}
            />
          </div>
          <p className="mt-2 text-center font-mono text-[11px] opacity-75">
            {chemCounts.teammates + chemCounts.club + chemCounts.nation === 0
              ? t("chemNoLinksYet")
              : [
                  chemCounts.teammates > 0
                    ? t("chemTeammates", { count: chemCounts.teammates })
                    : null,
                  chemCounts.club > 0 ? t("chemClubLegends", { count: chemCounts.club }) : null,
                  chemCounts.nation > 0 ? t("chemCountrymen", { count: chemCounts.nation }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
        </div>
      ) : null}

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
          {/* ⛔ FIRST child and `pointer-events: none`: it spans the whole pitch, so if it
              ever took a hit it would make every position unselectable at once. The pitch's
              own `::after` centre circle did exactly that to a single CM; this is that trap
              at full size, and the test proves the spots still click rather than trusting
              the style. */}
          {placedXi != null ? (
            <svg
              className="chem-links"
              data-testid="chem-links"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              style={{ pointerEvents: "none" }}
            >
              {chemLinks.map(({ i, j, tier, title }) => {
                const a = shape.slots[i]!;
                const b = shape.slots[j]!;
                const at = {
                  x: (a.row / (rows + 1)) * 100,
                  y: (a.col / (shape.slots.filter((s) => s.row === a.row).length + 1)) * 100,
                };
                const bt = {
                  x: (b.row / (rows + 1)) * 100,
                  y: (b.col / (shape.slots.filter((s) => s.row === b.row).length + 1)) * 100,
                };
                return (
                  <line
                    key={`${i}-${j}`}
                    data-testid="chem-link"
                    data-tier={tier}
                    className="chem-link"
                    x1={at.x}
                    y1={at.y}
                    x2={bt.x}
                    y2={bt.y}
                  >
                    {/* ⚠️ Colour is never the only channel — the link NAMES itself. */}
                    {title != null ? <title>{title}</title> : null}
                  </line>
                );
              })}
            </svg>
          ) : null}
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
                    {typeof rivalId === "string" ? (
                      <Flag code={rivalId} name={null} className="text-[26px] leading-none" />
                    ) : (
                      <ClubCrest teamId={rivalId} size={26} />
                    )}
                    <select
                      className="pd-select"
                      value={rivalId ?? ""}
                      // Resolve the CHOICE, never Number() the value: a nation's id is its
                      // flag-icons code, and Number("eg") is NaN - which would fetch nothing
                      // and read as "their squad could not be loaded".
                      onChange={(e) => {
                        const picked = rivals.find((c) => String(c.id) === e.target.value);
                        setRivalId(picked?.id ?? null);
                      }}
                    >
                      {rivals.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.id === clubId || (nation != null && c.id === nation)
                            ? t(nation != null ? "rivalOwnNation" : "rivalOwnClub", {
                                name: c.name,
                              })
                            : c.name}
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
                      ? t(nation != null ? "rivalUnavailableNation" : "rivalUnavailable")
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
                    {t(
                      nation != null
                        ? "modeBackNation"
                        : captain != null
                          ? "modeBackCaptain"
                          : "modeBack",
                    )}
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
          data-testid="pd-veil"
          role="dialog"
          aria-modal="true"
          aria-label={veilTitle}
          // ⛔ A round a pack LOCKS cannot be dismissed by clicking away; a review always can,
          // and so can a round in a pack whose picks are not final.
          onClick={(e) => {
            if (dismissable && e.target === e.currentTarget) setVeil(null);
          }}
        >
          <div className="pd-veil-inner">
            <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{veilTitle}</h2>
            <div className="mb-6 mt-1 space-y-1">
              <p className="text-muted-foreground text-sm">
                {veil.mode !== "round"
                  ? t("pitchPickFinal")
                  : currentCard != null
                    ? t("pitchSwapHint", { name: currentCard.name })
                    : roundHint}
              </p>
              {/* ⚠️ The refund named in MONEY, because that is the decision. "Drop him" says
                  nothing; "drop him and £14.1m comes back" is the whole reason to tap. */}
              {veil.mode === "round" && currentCard?.price != null && view != null ? (
                <p className="text-sm font-semibold text-emerald-300">
                  {t("pitchSwapRefund", { amount: `£${money(currentCard.price)}m` })}
                </p>
              ) : null}
              {/* ⭐ THE RING LINE (TASK-1842). Stated whenever the hand is not the nation's
                  own — the widening is the mode's drama, and it must never be silent. */}
              {handRing === "continent" && nationName != null && continentKey != null ? (
                <p data-testid="pd-ring-line" className="text-sm font-semibold text-sky-300">
                  {t("pitchRingContinent", { nation: nationName, continent: t(continentKey) })}
                </p>
              ) : handRing === "world" && nationName != null ? (
                <p data-testid="pd-ring-line" className="text-sm font-semibold text-sky-300">
                  {t("pitchRingWorld", { nation: nationName })}
                </p>
              ) : null}
            </div>

            {view != null && veil.mode === "round" ? (
              <div className="mb-5">{meter(view)}</div>
            ) : null}

            <div className="pd-hand" key={`${veil.slot}-${veil.mode}`}>
              {veilCards.map((c, k) => {
                /**
                 * The man the coach is already holding in this slot, dealt back to him in his
                 * own hand. ⭐ Tapping him DROPS him (owner, 2026-08-26) — under a budget the
                 * move is often "I cannot afford anyone here yet, take him off and go spend
                 * the money at the back", and a hand that can only ever replace forces the
                 * coach to buy someone he does not want in order to sell.
                 */
                const isCurrent = veil.mode === "round" && c.cardId === openPick;
                /**
                 * ⛔ Dealt but DISABLED, never filtered out (owner, 2026-08-25). Seeing the
                 * £200m card you are priced out of is the mode working; removing it from the
                 * hand would make the budget invisible and spending big consequence-free.
                 *
                 * ⚠️ The reserve rule guarantees the cheapest card in this hand is always
                 * affordable, so a hand can never be entirely dead — see `domain/budget.ts`.
                 *
                 * ⚠️ The incumbent is never blocked: his fee is refunded the moment his slot
                 * re-opens, and in any case DROPPING him costs nothing to begin with.
                 */
                const blocked = !isCurrent && view != null && !canAfford(c, view);
                const grey = veil.mode === "round" && blocked;
                const choose = t("pitchChooseCard", {
                  name: c.name,
                  // A card's own role is nullable in the data; the SLOT's never is, and it is
                  // the role being filled that the label is about.
                  role: c.role ?? roleAt(veil.slot),
                  ovr: c.ratings?.overall ?? 0,
                });
                return (
                  <div
                    key={c.cardId}
                    data-testid="pd-candidate"
                    data-unaffordable={grey ? "" : undefined}
                    className={`pd-card${isCurrent ? " pd-card-current" : ""}${
                      grey ? " opacity-45 grayscale" : ""
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
                    {/* ⚠️ Says which of the five he already owns. Without it the swap veil is
                        five strangers and the one he is trying to replace is invisible. */}
                    {isCurrent ? (
                      <span data-testid="pd-current-mark" className="pd-current-mark">
                        {t("pitchCurrentPick")}
                      </span>
                    ) : null}
                    {/* The ring chip (TASK-1842) — only on the SURPRISING case: a card that
                        is not a countryman. Same non-interactive layering as the mark above,
                        or the one card the coach most wants to read would eat its own tap. */}
                    {/* ⭐ What this card would ADD. Rendered on every candidate including
                        the zeroes: "this one buys you nothing" is exactly as useful as
                        "+7", and showing it only on the good ones would turn the absence
                        of a badge into a second thing to interpret. */}
                    {placedXi != null && veil.mode === "round" ? (
                      <span
                        data-testid="chem-delta"
                        data-delta={chemDelta(veil.slot, c)}
                        className={`chem-delta${chemDelta(veil.slot, c) > 0 ? " chem-delta-up" : ""}`}
                      >
                        {chemDelta(veil.slot, c) > 0
                          ? t("chemDelta", { points: chemDelta(veil.slot, c) })
                          : t("chemDeltaNone")}
                      </span>
                    ) : null}
                    {handRing != null && handRing !== "nation" ? (
                      <span data-testid="pd-ring-chip" className="pd-ring-chip">
                        {handRing === "continent" && continentKey != null
                          ? t(continentKey)
                          : t("ringWorld")}
                      </span>
                    ) : null}
                    {veil.mode === "round" ? (
                      // The ONLY control on a card, and it sits outside the turning faces:
                      // a rotated, backface-hidden surface does not hit-test reliably.
                      <button
                        type="button"
                        data-testid={isCurrent ? "pd-drop" : undefined}
                        className={`pd-pick${isCurrent ? " pd-pick-drop" : ""}`}
                        disabled={blocked}
                        aria-label={
                          isCurrent
                            ? t("pitchDropCard", { name: c.name })
                            : blocked && view != null
                              ? `${choose} — ${t("budgetShortfall", {
                                  amount: `£${money(shortfall(c, view))}m`,
                                })}`
                              : choose
                        }
                        onClick={() => {
                          dispatch(
                            isCurrent
                              ? { type: "clear", index: veil.slot }
                              : { type: "pick", index: veil.slot, cardId: c.cardId },
                          );
                          setVeil(null);
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

            {veil.mode === "round" ? (
              <div className="mt-6 flex flex-col items-center gap-3">
                {/* ⭐ THE WAY OUT (owner report, 2026-08-26). Present only where the pack does
                    not lock its picks: a pack that does owes the coach a decision and gets no
                    button, which is Legacy Club's rule and stays Legacy Club's rule. */}
                {canLeaveRound ? (
                  <button
                    type="button"
                    data-testid="veil-back"
                    onClick={() => setVeil(null)}
                    className="pd-back-btn"
                  >
                    {currentCard != null
                      ? t("pitchKeepPick", { name: currentCard.name })
                      : t("pitchBackToSquad")}
                  </button>
                ) : null}
                {/* ⚠️ Same rule as `roundHint`: "swap anyone out until the squad and the money
                    both work" is Budget Cap's promise, and a pack that locks its picks has
                    neither a swap nor a budget to make it true. */}
                <p className="text-muted-foreground font-mono text-[11px]">
                  {t(picksAreFinal ? "pitchNoTimerFinal" : "pitchNoTimer")}
                </p>
              </div>
            ) : (
              <button type="button" onClick={() => setVeil(null)} className="pd-close">
                {t("pitchClose")}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/**
       * ⭐ THE BENCH AS A SHELF, not five loose boxes (owner report, 2026-08-26).
       *
       * It shipped as five 92px tiles reading "GK 74" — no name, no fee, no frame, sitting
       * under a full-bleed pitch — and the owner did not see it at a glance. It holds five
       * of the sixteen men and a real share of the money, so it gets a frame that separates
       * it from the pitch, a count that says how much work is left in it, and the SAME gold
       * disc the pitch spots use, so the two halves read as one squad rather than two lists.
       */}
      {locked && benchRoles.length > 0 ? (
        <section className="pd-bench" data-testid="pd-bench" aria-label={t("pitchBench")}>
          <header className="pd-bench-head">
            <span className="pd-bench-title">{t("pitchBench")}</span>
            <span className="pd-bench-rule" aria-hidden="true" />
            <span className="pd-bench-count" data-testid="pd-bench-count">
              {t("pitchBenchCount", { filled: benchFilled, total: benchRoles.length })}
            </span>
          </header>
          <div className="pd-bench-row">
            {benchRoles.map((role, i) => {
              const index = shape.slots.length + i;
              const id = state.picks[index];
              const card = id != null ? byId.get(id) : undefined;
              return (
                <button
                  key={`${role}-${i}`}
                  type="button"
                  data-testid="pd-bench-slot"
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
                  className={`pd-bench-slot${card ? " pd-bench-filled" : ""}${
                    card && (card.ratings?.overall ?? 0) < 80 ? " pd-bench-silver" : ""
                  }`}
                >
                  <span className="pd-bench-role">{role}</span>
                  <span className="pd-bench-disc">{card ? (card.ratings?.overall ?? 0) : "+"}</span>
                  {/* ⚠️ An empty slot names the JOB, not a dash. "—" reads as "nothing here";
                      "Add GK" reads as a thing the coach still has to do. */}
                  <span className="pd-bench-name">
                    {card ? card.name : t("pitchBenchAdd", { role })}
                  </span>
                  {card?.price != null ? (
                    <span data-testid="pd-bench-cost" className="pd-bench-cost">
                      £{money(card.price)}m
                    </span>
                  ) : (
                    <span className="pd-bench-cost pd-bench-cost-empty" aria-hidden="true">
                      —
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
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
