"use client";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import type { SeasonSpec } from "@/features/game/domain/rule-packs";
import { SeasonStart } from "./SeasonStart";
import { useEffect, useMemo, useReducer, useState } from "react";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import { FORMATIONS, type DraftPolicy, type PoolCard } from "@/features/game/domain/chaos-draft";
import type { RivalRef } from "@/features/game/domain/share-code";
import {
  loadRival,
  policyOf,
  type ChosenRival,
  type Difficulty,
} from "@/features/game/view/rival-choice";
import type { RivalSetup } from "@/features/game/view/match-session";
import {
  formationKey,
  formationNameFromKey,
  type Formation,
} from "@/features/game/domain/formation";
import { hashEvents } from "@/features/game/domain/hash";
import type { DecisionAnswer } from "@/features/game/domain/match-decisions";
import { decodeMatch } from "@/features/game/domain/share-code";
import { summaryFrom } from "@/features/game/domain/summary-card";
import type { RefereeStyle, Weather } from "@/features/game/domain/match-types";
import type { DraftSpec, ScreensSpec, SetupSpec } from "@/features/game/domain/rule-packs";
import { clearMatch, loadMatch, saveMatch } from "@/features/game/storage/match-slot";
import { loadRun, type SavedRun } from "@/features/game/storage/season-slot";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";
import { replayMatch, type RestoredMatch } from "@/features/game/view/match-replay";
import { createPlayState, playReducer, type PlayPhase } from "@/features/game/view/play-machine";
import { useMatchDriver } from "@/features/game/view/use-match-driver";
import { scoreAt } from "@/features/game/view/score";
import { randomSeed } from "@/features/game/view/seed";
import { buildShareCode, replayShared } from "@/features/game/view/share-link";
import { ChaosDraft } from "./ChaosDraft";
import { DecisionPrompt } from "./DecisionPrompt";
import { DraftHub } from "./DraftHub";
import { MatchLive } from "./MatchLive";
import { MatchProgramme } from "./MatchProgramme";
import { MatchSummary } from "./MatchSummary";
import { MatchupPreview } from "./MatchupPreview";
import { MatchView } from "./MatchView";
import { PitchDraft, type ClubChoice } from "./PitchDraft";
import { ResumeDialog } from "./ResumeDialog";

/** Seconds a decision waits before answering itself. Extendable per WCAG 2.2.1. */
const DECISION_LIMIT = 20;

/**
 * The match session: draft → preview → live → summary, in one container.
 *
 * It owns the generator, which is the whole point. `MatchView` renders a match; this
 * DRIVES one, feeding the view a model that grows segment by segment and pausing the
 * clock wherever the coach has a decision to make.
 *
 * ⚠️ Only the coach's decisions surface. `createStream` answers the opponent's with
 * `defaultAnswer` — every decision the engine raises must be answered or the generator
 * hangs, and the away side behaving exactly as it does in a batch match is deliberate.
 *
 * ⚠️ `draft` changes the SETUP PHASE ONLY (TASK-1810). A rule pack that declares one gets
 * the round-based room in place of the free-build hub; preview, live and summary are
 * identical either way, because both paths hand up the same `(players, formation)`.
 */
export function GamePlay({
  pool,
  initialPhase,
  draft,
  setup,
  backHref,
  screens,
  opponent,
  rivals,
  clubId,
  captain,
  captaincies,
  referees,
  budget,
  nation,
  chemistry,
  season,
  clubs,
}: {
  pool: PoolCard[];
  initialPhase?: PlayPhase;
  /** The pack's draft rules. Absent means the shipped free-build hub. */
  draft?: DraftSpec;
  /**
   * The pack's spending cap, in indexed euros (TASK-1810 Budget Cap). Absent = no budget.
   *
   * It reaches TWO places, for two different reasons:
   *  - `PitchDraft`, where it gates what the coach may buy;
   *  - every `RivalSetup`, where it caps the opponent's own draft.
   *
   * ⛔ The rival half is not optional. `policy: "budget"` with no cap has an Infinity ceiling,
   * so it silently degenerates into best-available and the coach's €100M XI (mean 80.8) faces
   * the unlimited ceiling XI (mean 94.0) — the 2026-08-19 balance defect, looking entirely
   * normal on screen. Every path that rebuilds the match must pass it or the replay drafts a
   * different eleven and reads as a corrupt save.
   *
   * ⚠️ It is still a DRAFT-time rule for the COACH: nothing on the replay path may re-validate
   * his XI against it. Re-checking a constraint on resolution is how a legal match becomes
   * unresumable after a data change.
   */
  budget?: number;
  /**
   * The chosen nation's flag-icons code (TASK-1842 Nationality Draft). Absent = no rings,
   * and every other pack's deal is byte-identical to before the mode existed.
   *
   * ⚠️ A ROUTE value, not a pack field — the pack declares `nationRings` and the segment
   * supplies the country, the same split as `clubHistory` + `clubId`.
   */
  nation?: string;
  /**
   * Score this XI on how well it LINKS, and show the links on the pitch (Chemistry Draft,
   * TASK-1810 PR 5). Absent = every chemistry surface is inert and the draft renders exactly
   * as it did before the mode existed.
   *
   * A boolean because the rule carries no value: the tiers and the adjacency band are frozen
   * measured constants, so the pack's constraint only says the rule APPLIES. The route reads
   * it off `constraints`, the same way the budget page reads its cap.
   */
  chemistry?: boolean;
  /**
   * The pack's season league (TASK-1811). Absent = the mode has no season, which is every pack
   * but Legacy — so they are untouched, and the inertness control asserts it.
   *
   * ⚠️ Declaring it does NOT start a season. The coach must also have asked for one via
   * `?format=season`; the two together are what swap the match flow for the hub.
   */
  season?: SeasonSpec;
  /** Every club the mode offers, so a season can draw a league from them. */
  clubs?: ReadonlyArray<{ id: number; name: string }>;
  /**
   * How the XI is assembled (TASK-1838). Absent = the coach builds it himself.
   *
   * ⚠️ A pack FIELD, never a mode check — same rule as `screens`. `"reveal"` mounts the
   * auto-draft board, whose Play hands up an XI, a formation AND the seed it drew them
   * from; see `SetupSpec` for why the seed travels with them.
   */
  setup?: SetupSpec;
  /** Where "choose a different club" goes. A link, because the choice is a ROUTE now. */
  backHref?: string;
  /**
   * Which match screens the pack uses (TASK-1810). Absent = the shipped ones.
   *
   * ⚠️ A pack FIELD, never a mode check. This container must not learn about game modes —
   * "modes are rule packs, not code paths" is the locked architecture, and a
   * `mode === "legacy"` branch here is exactly the shape that rule forbids.
   */
  screens?: ScreensSpec;
  /**
   * How the pack's auto-drafted opponent picks his XI (owner round 2, 2026-08-19).
   *
   * ⛔ Passed to the live start AND to both replay paths. Resume and share re-run
   * `buildSession` and verify by fingerprint, so a replay built without it drafts a
   * different opponent and reads as a corrupt save.
   */
  opponent?: DraftPolicy;
  /**
   * The clubs he can choose to face (owner, 2026-08-19). Absent = no picker at all.
   *
   * ⚠️ NAMES ONLY — 51 of them, not their squads. The chosen club's cards are fetched from
   * a prerendered route; see `view/rival-choice.ts` for why a prop would be ~1.2 MB.
   */
  rivals?: readonly ClubChoice[];
  /** The club whose page this is, preselected so doing nothing plays the shipped match. */
  clubId?: number;
  /**
   * The icon a `captainFirst` pack places in the XI before drafting (TASK-1810).
   *
   * ⚠️ Passed straight through to the draft. `GamePlay` owns the SESSION, not the draft's
   * rules — and the captain is already in `pool`, so nothing downstream of the draft
   * (resume, share, the replay fingerprint) needs to know he was treated specially.
   */
  captain?: PoolCard;
  /**
   * playerId -> real captaincies, narrowed to this club at build time (TASK-1810).
   *
   * Only the Legacy screens read it; the armband rule needs real captaincies and
   * `captains.json` is a server-only read.
   */
  captaincies?: Record<number, number>;
  /**
   * Real referee names, from the committed fixtures (TASK-1810).
   *
   * ⚠️ Cosmetic only — the engine's own `RefereeStyle` still decides how tightly the match
   * is refereed. This just lets the scoreboard name him instead of labelling him "STRICT".
   */
  referees?: readonly string[];
}) {
  const t = useTranslations("game");
  const locale = useLocale();
  /**
   * The route this match is being played on — where its share link must point.
   *
   * ⛔ Never a constant (owner-reported, 2026-08-19). A share code carries card ids, and a
   * card only resolves against the pool the RECEIVING route ships. Legacy's pools are
   * per-club, so a Legacy link pointing at `/game/draft` silently dropped its match and
   * opened an ordinary draft hub instead.
   *
   * ⚠️ Locale-stripped by `@/i18n/navigation`, because `shareUrl` adds the prefix back. It
   * is nullable under the test stub, and falling through to the canonical route there is
   * exactly right — that IS the route those tests render.
   */
  const sharePath = usePathname() ?? undefined;
  const [state, dispatch] = useReducer(playReducer, createPlayState(initialPhase));

  // The match itself lives in the driver (TASK-1817), shared with the daily challenge.
  // This container still owns the PHASE, the storage slot and the share code.
  const driver = useMatchDriver();
  const { match, events, answers, pending, result } = driver;

  /** What the coach drafted, kept so the live match can be written to storage. */
  const [squad, setSquad] = useState<{ cardIds: PlayerSeasonId[]; formationKey: string } | null>(
    null,
  );
  /**
   * The changes the coach made HIMSELF (TASK-1810).
   *
   * ⚠️ Not derived from `answers`. In auto mode the engine answers most offers with its
   * own recommendation, and those are indistinguishable from a coach's once they are in
   * the replay stream — which is how the full-time screen came to claim five
   * substitutions in a match the coach never touched.
   */
  const [coachMoves, setCoachMoves] = useState<DecisionAnswer[]>([]);
  /** An unfinished match found in storage, replayed and verified, awaiting the coach. */
  const [offer, setOffer] = useState<RestoredMatch | null>(null);
  /**
   * The club being faced, and how it drafted (owner, 2026-08-19).
   *
   * ⛔ Kept in state rather than re-derived, because it is part of the match's IDENTITY.
   * Everything that rebuilds this match — the storage record, the share code, the resume —
   * has to be handed the SAME club and the SAME policy or it drafts a different eleven.
   */
  const [rival, setRival] = useState<{ setup: ChosenRival | null; difficulty: Difficulty } | null>(
    null,
  );
  /**
   * The two clubs' ids, for their crests (owner, 2026-08-20).
   *
   * ⚠️ The AWAY id is the rival the coach chose, and it is null whenever he faces his own
   * club's pool — the mode's behaviour before a rival could be picked, and still the
   * fallback when the squad fetch fails. `ClubCrest` renders nothing for a null id, so the
   * scoreboard degrades to the bare name it showed before.
   */
  // ⚠️ A NATION rival's id is a flag-icons code (TASK-1842), and a nation has no crest —
  // narrowing to numbers here keeps every crest consumer exactly as it was: the scoreboard
  // degrades to the bare name, which is what a null id always meant.
  const awayId = rival?.setup?.teamId;
  const crests = { home: clubId ?? null, away: typeof awayId === "number" ? awayId : null };

  /** The rival belonging to the RESTORE OFFER, held until he accepts it. */
  const [offerRival, setOfferRival] = useState<{
    setup: ChosenRival | null;
    difficulty: Difficulty;
  } | null>(null);

  /**
   * The rival as the session builder wants it.
   *
   * ⛔ `budget` rides with `policy` on BOTH arms and on every fallback below. It is only ever
   * read by `policy: "budget"`, but omitting it there does not turn the budget off — it makes
   * the rival's ceiling Infinity, so the policy silently becomes best-available and a replay
   * built without it drafts a different eleven than the live match did.
   */
  const rivalSetup = (
    chosen: { setup: ChosenRival | null; difficulty: Difficulty } | null,
  ): RivalSetup =>
    chosen?.setup == null
      ? { policy: opponent, budget, chemistry }
      : {
          policy: policyOf(chosen.difficulty),
          pool: chosen.setup.cards,
          name: chosen.setup.name,
          budget,
          chemistry,
        };

  /** The rival as a share code carries it. */
  const rivalRef = (
    chosen: { setup: ChosenRival | null; difficulty: Difficulty } | null,
  ): RivalRef | null =>
    chosen?.setup == null
      ? null
      : { teamId: chosen.setup.teamId, policy: policyOf(chosen.difficulty) };

  /**
   * The phase, mirrored into the URL.
   *
   * ⚠️ WRITTEN, NEVER READ, and `history: "replace"` so it adds no history entries. The
   * reducer stays the single driver of phase; the browser must not become a second one.
   * `setup` writes null so the hub keeps a clean URL.
   *
   * In B2 this is a write-only mirror — it makes the current phase legible and gives
   * TASK-1812's seed-sharing the parameter to build on, but it drives nothing.
   */
  const [, setPhaseParam] = useQueryState(
    "phase",
    parseAsStringLiteral(["preview", "live", "summary"] as const).withOptions({
      history: "replace",
      shallow: true,
      clearOnDefault: true,
    }),
  );

  useEffect(() => {
    void setPhaseParam(state.phase === "setup" ? null : state.phase);
  }, [state.phase, setPhaseParam]);

  /**
   * Did the coach ask for a SEASON (TASK-1811)?
   *
   * ⚠️ Read here rather than on the server so the page stays `force-static`: the season and the
   * single match share one prerendered route and are told apart on the client. D11 deferred a
   * `?format=` param "because nothing would read it" — this is the thing that reads it.
   *
   * ⛔ It only means anything when the PACK declares a season. A `?format=season` typed onto a
   * mode without one is ignored, so the param can never conjure a league out of a pack that has
   * no idea what a league is.
   */
  const [formatParam] = useQueryState("format", parseAsString);
  const seasonRequested = season != null && formatParam === "season";
  const [seasonReading, setSeasonReading] = useState(seasonRequested);
  /** The squad he drafted for a season — set once, then the hub owns the run. */
  const [seasonReadFailed, setSeasonReadFailed] = useState(false);
  const [seasonReadAttempt, setSeasonReadAttempt] = useState(0);
  const [seasonSquad, setSeasonSquad] = useState<{
    players: PoolCard[];
    formation: Formation;
    seed: number;
    saved?: SavedRun;
  } | null>(null);

  /**
   * A season already in progress, restored BEFORE the draft (TASK-1811).
   *
   * ⛔ It has to happen here, not in the hub. The season's seed is fresh entropy from
   * `confirmSquad`, and the league is drawn from that seed — so re-drafting on a reload would
   * build a different set of clubs, and the stored results (which name clubs by INDEX) would
   * render as a normal-looking table of matches that never happened. Restoring the seed with
   * the squad is what keeps the run's identity intact across a reload.
   *
   * ⚠️ No resume dialog, unlike a match: a season is "draft once and live with it", so it is
   * simply picked up where it was left. "Abandon season" in the hub is the way out, and it is
   * what clears the slot.
   */
  useEffect(() => {
    if (!seasonRequested) return;
    setSeasonReadFailed(false);
    let live = true;
    void (async () => {
      try {
        const saved = await loadRun();
        if (!live || saved == null) return;
        const byId = new Map(pool.map((c) => [c.cardId, c]));
        const players: PoolCard[] = [];
        for (const id of saved.cardIds) {
          const card = byId.get(id);
          // ⚠️ NOT cleared. The slot is global and a season is per-club, so a run this pool
          // cannot rebuild is almost always another club's live season rather than a corrupt
          // record — discarding it here would destroy it just for visiting a second club.
          if (card == null) return;
          players.push(card);
        }
        const formation = FORMATIONS.find((f) => formationKey(f) === saved.formationKey);
        if (formation == null || formation.slots.length !== players.length) return;
        setSeasonSquad({ players, formation, seed: saved.seed, saved });
      } catch {
        if (live) setSeasonReadFailed(true);
      } finally {
        if (live) setSeasonReading(false);
      }
    })();
    return () => {
      live = false;
    };
    // Mount only: `pool` is a build-time constant, and re-running this after the coach has
    // abandoned a season would drag him straight back into it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonReadAttempt]);

  /**
   * A shared match, read from the URL (TASK-1812).
   *
   * ⚠️ READ ONCE, on mount. Unlike `phase` this one is read, but it only chooses WHICH
   * match we enter — never where we are inside it. The reducer stays the single driver of
   * phase.
   */
  const [shareCode, setShareCode] = useQueryState(
    "m",
    parseAsString.withOptions({ history: "replace", shallow: true }),
  );
  /** Watching someone else's match. Suppresses persistence and the resume offer. */
  const [shared, setShared] = useState(false);
  /** Our replay differs from the sender's fingerprint — warn, never substitute. */
  const [drifted, setDrifted] = useState(false);

  /** Build the match and run to the first decision. */
  const confirmSquad = (
    players: PoolCard[],
    formation: Formation,
    chosen?: { setup: ChosenRival | null; difficulty: Difficulty },
    /**
     * The seed the setup screen ALREADY drafted from, when it drafted anything (TASK-1838).
     *
     * ⛔ A reveal setup drew its rival from this seed and put him on screen. Drawing a fresh
     * one here would re-draft that rival between the board and the kick-off, so the coach
     * would walk out against an opponent he was never shown. Every other setup builds only
     * the coach's own XI and leaves this empty, which is what keeps the shipped modes on
     * fresh entropy per match.
     */
    presetSeed?: number,
  ) => {
    const seed = presetSeed ?? randomSeed();

    /**
     * ⛔ A SEASON STOPS HERE — the driver is never started.
     *
     * Everything below builds and runs ONE match. A season's first fixture is not that match:
     * the run owns the schedule, and starting a match here would kick off week 1 behind the
     * hub, burning the seed the season needs and leaving a live match nobody asked for in the
     * resume slot.
     */
    if (seasonRequested && season != null) {
      setSeasonSquad({ players, formation, seed });
      return;
    }

    const picked = chosen ?? null;
    setRival(picked);
    driver.start(
      pool,
      players,
      formation,
      seed,
      { home: t("yourXi"), away: t("rivals") },
      rivalSetup(picked),
    );
    setSquad({
      cardIds: players.map((p) => p.cardId),
      formationKey: formationKey(formation),
    });
    dispatch({ type: "confirmSquad", seed });
  };

  /**
   * Look for an unfinished match, once, after mount.
   *
   * ⚠️ After mount, never during render. All four `/game/*` routes are `force-static`
   * and the prerender has no IndexedDB — reading during render would fail the build or
   * bake one visitor's match into the CDN copy.
   */
  /**
   * Enter a match someone shared (TASK-1812).
   *
   * The replay resolves to a FINISHED match in well under 100ms, so there is nothing to
   * stream: hand the view the whole event list and the existing `resume` transition takes
   * us to `live`, where `pending` is null, `holdAt` falls to undefined and `MatchView`
   * plays the full 90 with commentary and speed control. No new phase, no new screen.
   */
  useEffect(() => {
    if (seasonRequested || shareCode == null || shareCode === "") return;
    const decoded = decodeMatch(shareCode);
    if (decoded == null) {
      // ⚠️ A bad code is not an error screen. Someone following a mangled link should land
      // on something that works, so drop the parameter and show the ordinary hub.
      void setShareCode(null);
      return;
    }

    let live = true;
    void (async () => {
      /**
       * ⛔ The rival's cards must be IN HAND before the replay, not after it.
       *
       * The opponent is rebuilt by re-running its draft over those cards, so replaying
       * first and fetching afterwards would reproduce a different eleven and then blame
       * the mismatch on the sender's build.
       */
      const chosen = decoded.rival == null ? null : await loadRival(decoded.rival.teamId);
      if (!live) return;
      if (decoded.rival != null && chosen == null) {
        // The club could not be loaded, so this match is not reproducible here. Dropping
        // the code is honest; replaying it against a substitute opponent would not be.
        void setShareCode(null);
        return;
      }

      const picked =
        chosen == null
          ? null
          : {
              setup: chosen,
              difficulty: (decoded.rival!.policy === "best" ? "best" : "balanced") as Difficulty,
            };
      const replayed = replayShared(
        pool,
        decoded,
        { home: t("yourXi"), away: t("rivals") },
        picked == null ? { policy: opponent, budget, chemistry } : rivalSetup(picked),
      );
      if (!live) return;
      if (replayed == null) {
        void setShareCode(null);
        return;
      }

      // ⚠️ `pending: null` — a shared match is finished on arrival, so there is nothing
      // waiting to be answered.
      setRival(picked);
      driver.adopt({ ...replayed, pending: null });
      setSquad({
        cardIds: decoded.cardIds,
        formationKey: formationKey(replayed.session.home.formation),
      });
      setShared(true);
      setDrifted(replayed.drifted);
      setOffer(null);
      dispatch({ type: "resume", seed: replayed.session.seed });
    })();
    return () => {
      live = false;
    };
    // Mount only, for the same reason as the restore effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      // ⚠️ A share link OUTRANKS a saved match. Offering Resume on top of someone else's
      // match would put two matches on one screen, and the visitor's own is not lost —
      // it is simply left in the slot untouched.
      if (seasonRequested || (shareCode != null && shareCode !== "")) return;
      const record = await loadMatch();
      if (!live || record == null) return;
      // ⛔ Same rule as the share path: the rival's cards before the replay, never after.
      const chosen = record.rival == null ? null : await loadRival(record.rival.teamId);
      if (!live) return;
      if (record.rival != null && chosen == null) {
        // A saved match whose opponent cannot be rebuilt is not resumable, and discarding
        // it is the existing policy for every other kind of drift.
        void clearMatch();
        return;
      }
      const picked =
        chosen == null
          ? null
          : {
              setup: chosen,
              difficulty: (record.rival!.policy === "best" ? "best" : "balanced") as Difficulty,
            };
      const restored = replayMatch(
        pool,
        record,
        { home: t("yourXi"), away: t("rivals") },
        picked == null ? { policy: opponent, budget, chemistry } : rivalSetup(picked),
      );
      if (!live) return;
      if (restored == null) {
        // Diverged, or the pool moved under it. A stale save is not the coach's problem.
        void clearMatch();
        return;
      }
      setOfferRival(picked);
      setOffer(restored);
    })();
    return () => {
      live = false;
    };
    // Mount only: `pool` is a build-time constant and `t` is stable for the locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Persist the live match — on kick-off and after every answer, roughly six writes.
   *
   * Gated on `live` because the slot holds a live match ONLY (owner decision): saving at
   * the preview would offer a resume into a match that had not started.
   */
  useEffect(() => {
    // ⛔ Never persist a shared match. Watching someone else's must not overwrite your own,
    // and a shared match is finished on arrival so there would be nothing to resume into.
    if (shared || seasonRequested) return;
    if (state.phase !== "live" || match == null || squad == null || result != null) return;
    void saveMatch({
      cardIds: squad.cardIds,
      formationKey: squad.formationKey,
      seed: match.seed,
      answers,
      fingerprint: hashEvents(events),
      eventCount: events.length,
      rival: rivalRef(rival) ?? undefined,
    });
    // ⚠️ `rival` is deliberately in the deps: a resumed match adopts its club AFTER the
    // first save, so leaving it out would persist the next write against the wrong opponent.
  }, [state.phase, match, squad, answers, events, result, shared, rival, seasonRequested]);

  const resume = () => {
    if (offer == null) return;
    // ⛔ Adopted WITH its rival. The record was replayed against that club, and every
    // save and share from here on has to name the same one.
    setRival(offerRival);
    driver.adopt(offer);
    // ⚠️ Taken from the RECORD, never reconstructed from the session: a resumed match must
    // keep saving under the same identity, and `GameTeam` holds cards rather than the
    // formation key. Rebuilding either would be a second source of truth.
    setSquad({ cardIds: offer.record.cardIds, formationKey: offer.record.formationKey });
    setOffer(null);
    dispatch({ type: "resume", seed: offer.session.seed });
  };

  const startOver = () => {
    setOffer(null);
    void clearMatch();
  };

  // The model is rebuilt from the events we have so far, so the view always renders a
  // complete-looking match that simply has not finished arriving yet.
  const model = useMemo(() => {
    if (match == null || events.length === 0) return null;
    return buildMatchViewModel(match.home, match.away, {
      score: { home: 0, away: 0 },
      events,
      seed: match.seed,
    });
  }, [match, events]);

  const referee = useMemo(
    () => (events.find((e) => e.kind === "referee")?.refStyle ?? null) as RefereeStyle | null,
    [events],
  );
  const weather = useMemo(
    () => (events.find((e) => e.kind === "weather")?.weather ?? null) as Weather | null,
    [events],
  );

  // Where the match was left. Passed to `scoreAt` so a goal still under VAR review shows
  // as it stood at that moment rather than as the verdict later made it.
  const restoredMinute = offer?.events[offer.events.length - 1]?.minute ?? 0;

  /**
   * ⛔ The season takes over BEFORE the match phases, and only once a squad exists.
   *
   * It sits above the setup branch rather than inside it because a season has no `match` — the
   * guard below treats a null match as "still in setup", which would send the coach back to the
   * draft he has already completed.
   */
  if (seasonRequested && seasonReadFailed)
    return (
      <div role="alert">
        {t("seasonResumeBlocked")}{" "}
        <button
          onClick={() => {
            setSeasonReading(true);
            setSeasonReadAttempt((n) => n + 1);
          }}
        >
          {t("seasonRetry")}
        </button>
      </div>
    );
  if (seasonRequested && seasonReading)
    return <p data-testid="season-loading">{t("seasonBuilding")}</p>;
  if (seasonRequested && season != null && seasonSquad != null && clubId != null) {
    return (
      <SeasonStart
        saved={seasonSquad.saved}
        captaincies={captaincies}
        referees={referees}
        spec={season}
        coachId={clubId}
        coachName={clubs?.find((c) => c.id === clubId)?.name ?? String(clubId)}
        seed={seasonSquad.seed}
        squad={seasonSquad.players}
        rosterPool={pool}
        formation={seasonSquad.formation}
        clubs={clubs ?? []}
        onAbandon={() => setSeasonSquad(null)}
      />
    );
  }

  if (state.phase === "setup" || match == null) {
    return (
      <>
        {setup === "reveal" ? (
          <ChaosDraft pool={pool} onConfirm={confirmSquad} />
        ) : draft != null ? (
          <PitchDraft
            pool={pool}
            draft={draft}
            onConfirm={confirmSquad}
            backHref={backHref}
            rivals={rivals}
            clubId={clubId}
            captain={captain}
            budget={budget}
            nation={nation}
            chemistry={chemistry}
          />
        ) : (
          <DraftHub pool={pool} onConfirm={confirmSquad} />
        )}
        {offer != null ? (
          <ResumeDialog
            homeName={offer.session.home.name}
            awayName={offer.session.away.name}
            score={scoreAt(offer.events, restoredMinute)}
            minute={restoredMinute}
            onResume={resume}
            onStartOver={startOver}
          />
        ) : null}
      </>
    );
  }

  if (state.phase === "preview") {
    const onKickOff = () => dispatch({ type: "kickOff" });
    const onBack = () => {
      // ⚠️ Cleared in the handler, never in an effect. An effect gated on "phase is
      // not live" would race the restore effect on mount and wipe the record before
      // it could be read.
      void clearMatch();
      dispatch({ type: "backToSetup" });
    };
    // TASK-1810: the owner-designed matchday programme, for packs that ask for it.
    // Everything else keeps the shipped VS screen.
    return screens === "legacy" ? (
      <MatchProgramme
        home={match.home}
        away={match.away}
        crests={crests}
        chemistry={chemistry}
        referee={referee}
        weather={weather}
        onKickOff={onKickOff}
        onBack={onBack}
      />
    ) : (
      <MatchupPreview
        home={match.home}
        away={match.away}
        referee={referee}
        weather={weather}
        onKickOff={onKickOff}
        onBack={onBack}
      />
    );
  }

  if (state.phase === "summary" && result != null) {
    // The link for THIS match. Built from live state rather than stored, because the tuple
    // that replays it is exactly what is already in hand.
    const code =
      squad == null
        ? null
        : buildShareCode({
            cardIds: squad.cardIds,
            formationKey: squad.formationKey,
            seed: match.seed,
            answers,
            fingerprint: hashEvents(events),
            rival: rivalRef(rival),
          });
    const cardData =
      squad == null || code == null
        ? null
        : summaryFrom({
            home: match.home,
            away: match.away,
            events,
            score: result.score,
            formationName: formationNameFromKey(squad.formationKey),
            seed: match.seed,
            code,
            path: sharePath,
            homeTeamId: crests.home,
            awayTeamId: crests.away,
          });

    return (
      <MatchSummary
        homeName={match.home.name}
        awayName={match.away.name}
        score={result.score}
        decisions={answers}
        coachMoves={screens === "legacy" ? coachMoves : undefined}
        roster={[...match.home.players, ...(match.home.bench ?? [])]}
        seed={match.seed}
        shareCode={code}
        cardData={cardData}
        locale={locale}
        sharePath={sharePath}
        crests={crests}
        shared={shared}
        drifted={drifted}
        onNewMatch={() => {
          void clearMatch();
          // ⚠️ Clear `?m=` too, or "New match" re-enters the shared match on the next
          // mount and the coach can never get back to their own draft.
          void setShareCode(null);
          setShared(false);
          setDrifted(false);
          setRival(null);
          dispatch({ type: "newMatch" });
        }}
      />
    );
  }

  return (
    <div>
      {model != null ? (
        screens === "legacy" ? (
          <MatchLive
            model={model}
            teams={{ home: match.home, away: match.away }}
            holdAt={pending?.minute ?? (result == null ? 0 : undefined)}
            pending={pending}
            captaincies={captaincies ?? {}}
            // The mode's icon leads his own XI. See `rankCaptains`'s `forced`.
            forcedCaptainId={captain?.playerId}
            referees={referees ?? []}
            crests={crests}
            onAnswer={driver.answer}
            onCoachMove={(a) => setCoachMoves((prior) => [...prior, a])}
            onFullTime={() => {
              void clearMatch();
              dispatch({ type: "fullTime" });
            }}
          />
        ) : (
          <MatchView model={model} holdAt={pending?.minute ?? (result == null ? 0 : undefined)} />
        )
      ) : null}
      {/* ⛔ The shipped prompt is for the OTHER packs only. Legacy's affordance is the
          Bench button, and a modal appearing over it unbidden is the exact complaint this
          redesign exists to answer. `MatchLive` answers its own decisions. */}
      {pending != null && screens !== "legacy" ? (
        <DecisionPrompt decision={pending} limit={DECISION_LIMIT} onAnswer={driver.answer} />
      ) : null}
      {result != null && screens !== "legacy" ? (
        <button
          type="button"
          onClick={() => {
            void clearMatch();
            dispatch({ type: "fullTime" });
          }}
          className="bg-primary text-primary-foreground mt-4 rounded-md px-5 py-2 text-sm font-bold"
        >
          {t("playFullTime")}
        </button>
      ) : null}
    </div>
  );
}
