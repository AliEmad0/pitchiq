import { displayName } from "./display-name";
import type { MatchEvent } from "./match-types";
import type { GameTeam } from "./team";

/**
 * TASK-1812 — the data behind the shareable match-summary card.
 *
 * Split from the drawing so the *content* is unit-testable: jsdom has no 2D canvas
 * context, so anything computed inside a paint function is untestable by construction.
 * This module decides WHAT the card says; the component only paints it.
 */

export type SummaryScorer = {
  minute: number;
  name: string;
  side: "home" | "away";
  /** Credited to this player but counting for the other side. */
  own: boolean;
  penalty: boolean;
};

export type SummaryCardData = {
  home: string;
  away: string;
  score: { home: number; away: number };
  scorers: SummaryScorer[];
  /** The shape's display NAME ("4-4-2 Flat"), not a key and not a slug. */
  formationName: string;
  seed: number;
  /**
   * The share code for this match.
   *
   * ⚠️ The shipped card prints a short URL rather than this, because a real code runs to
   * ~150 characters and cannot be set legibly. So a screenshot is NOT replayable — the
   * copied LINK is the replayable artefact. Kept here because the data layer should not
   * assume which of the two a given card design prints.
   */
  code: string;
};

/**
 * The scorers a final scoreline should list.
 *
 * ⚠️ **`disallowedAt` is the trap.** A chalked-off goal deliberately STAYS in the event
 * stream — that is where the VAR drama lives, and the scoreboard counts it until the
 * review lands. A *final* summary must filter it out, exactly as `match-types.ts`
 * documents: "a final scoreline filters on `disallowedAt == null`". Listing it would
 * print a scorer for a goal that never stood.
 *
 * ⛔ **An own goal carries its scorer in `ownGoalBy`, NOT in `playerId`.** `simulate`
 * calls `scoreGoal(state, opp, side, m, undefined, "own-goal", …, { ownGoalBy })` — the
 * `playerId` argument is literally `undefined` — so reading `playerId` renders every own
 * goal as "—". This module previously did exactly that, and its own docstring claimed the
 * opposite; the synthetic fixture that hid it set a `playerId` no real own goal has.
 *
 * ⚠️ And `side` is the side the goal COUNTS FOR, not the side the scorer plays for: that
 * same call passes `opp` as the scoring side. So a caller may group by `side` directly —
 * an own goal already sits with the team that benefited, which is also how a television
 * scoreline reads it.
 */
export function scorersFrom(
  events: readonly MatchEvent[],
  nameOf: (playerId: number) => string,
): SummaryScorer[] {
  return events
    .filter((e) => e.kind === "goal" && e.disallowedAt == null)
    .map((e) => {
      const scorer = e.source === "own-goal" ? (e.ownGoalBy ?? e.playerId) : e.playerId;
      return {
        minute: e.minute,
        name: scorer == null ? "—" : nameOf(scorer),
        side: (e.side ?? "home") as "home" | "away",
        own: e.source === "own-goal",
        penalty: e.source === "penalty",
      };
    })
    .sort((a, b) => a.minute - b.minute);
}

/** "23' Henry (pen)" · "67' Carragher (og)" — the line printed under the scoreline. */
export function scorerLine(s: SummaryScorer): string {
  const tag = s.own ? " (og)" : s.penalty ? " (pen)" : "";
  return `${s.minute}' ${s.name}${tag}`;
}

/**
 * A filename that survives every OS and still says what it is.
 *
 * ⚠️ Windows rejects `: * ? " < > |` and trailing dots, and a club like "Nott'm Forest"
 * carries an apostrophe that breaks naive shell quoting. Everything outside `[a-z0-9]`
 * collapses to a dash, and an empty result falls back rather than producing `pitchiq--0-0-.png`.
 */
export function summaryFilename(summary: SummaryCardData): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "team";
  return `pitchiq-${slug(summary.home)}-${summary.score.home}-${summary.score.away}-${slug(summary.away)}.png`;
}

/**
 * Assemble what the card says from a finished match.
 *
 * ⚠️ Names are resolved across BOTH squads and BOTH benches. A scorer can be a substitute,
 * and an own goal is credited to a defender on the other side — looking only at the home
 * XI would render a good share of real matches with "#1042" where a name belongs.
 */
export function summaryFrom(args: {
  home: GameTeam;
  away: GameTeam;
  events: readonly MatchEvent[];
  score: { home: number; away: number };
  formationName: string;
  seed: number;
  code: string;
}): SummaryCardData {
  const names = new Map(
    [
      ...args.home.players,
      ...(args.home.bench ?? []),
      ...args.away.players,
      ...(args.away.bench ?? []),
    ].map((p) => [p.playerId, displayName(p.name)] as const),
  );
  return {
    home: args.home.name,
    away: args.away.name,
    score: args.score,
    scorers: scorersFrom(args.events, (id) => names.get(id) ?? `#${id}`),
    formationName: args.formationName,
    seed: args.seed,
    code: args.code,
  };
}
