import type { MatchEvent } from "./match-types";

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

export type MatchSummary = {
  home: string;
  away: string;
  score: { home: number; away: number };
  scorers: SummaryScorer[];
  formationKey: string;
  seed: number;
  /** The share code, printed on the card so a screenshot alone can be replayed. */
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
 * ⚠️ An own goal is listed under the player who put it in, marked `(og)` — that is how a
 * scoreline reads on television — but `side` stays the side he *plays for*, so a caller
 * grouping by side must not treat it as a goal for that team.
 */
export function scorersFrom(
  events: readonly MatchEvent[],
  nameOf: (playerId: number) => string,
): SummaryScorer[] {
  return events
    .filter((e) => e.kind === "goal" && e.disallowedAt == null)
    .map((e) => ({
      minute: e.minute,
      name: e.playerId == null ? "—" : nameOf(e.playerId),
      side: (e.side ?? "home") as "home" | "away",
      own: e.source === "own-goal",
      penalty: e.source === "penalty",
    }))
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
export function summaryFilename(summary: MatchSummary): string {
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
