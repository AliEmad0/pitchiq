import { localizeDigits } from "@/utils/format";
import type { MatchEvent, Side } from "./match-types";

const CELLS = 6;
const CELL_MINUTES = 15;

/**
 * The match as six fifteen-minute cells — the Wordle grid analogue.
 *
 * It encodes the DRAMA, not the drafted XI, which is what makes it safe to post next to
 * someone who has not played today: a 2–0 comeback reads instantly without naming a single
 * player.
 *
 * ⚠️ FINAL-scoreline semantics: a goal chalked off by VAR is dropped outright
 * (`disallowedAt == null`), matching `scoreAt` at full time. A boolean check on the raw
 * event list would paint a 🟩 for a goal that never counted.
 *
 * ⚠️ Own goals need no special case — the engine sets `side` to the side the goal COUNTS
 * FOR and leaves `playerId` undefined, so reading `side` is both correct and the only
 * thing that works. Reading `playerId` is the TASK-1812 bug.
 */
export function matchStrip(events: readonly MatchEvent[], side: Side): string {
  const us = Array.from({ length: CELLS }, () => false);
  const them = Array.from({ length: CELLS }, () => false);

  for (const e of events) {
    if (e.kind !== "goal" || e.side == null) continue;
    if (e.disallowedAt != null) continue;
    // Clamped at both ends: stoppage-time goals fold into the last cell rather than
    // falling off the strip, and a minute-zero event cannot land at index -1.
    const cell = Math.min(CELLS - 1, Math.max(0, Math.ceil(e.minute / CELL_MINUTES) - 1));
    (e.side === side ? us : them)[cell] = true;
  }

  return us
    .map((ours, i) => (ours && them[i] ? "🟨" : ours ? "🟩" : them[i] ? "🟥" : "⬜"))
    .join("");
}

export interface ShareTextArgs {
  dayNumber: number;
  formationName: string;
  score: { home: number; away: number };
  strip: string;
  currentStreak: number;
  bestStreak: number;
  url: string;
  locale: string;
  /** Resolved strings — `domain/` never reaches for a translator itself. */
  labels: { title: string; win: string; draw: string; loss: string };
}

/**
 * The shareable text for a finished day.
 *
 * ⛔ Every number the coach sees goes through `localizeDigits`. `Intl.NumberFormat("ar")`
 * returns WESTERN digits in the browser, so the obvious call is silently wrong in Arabic.
 *
 * ⛔ The URL is deliberately NOT transliterated — Eastern-Arabic digits in a host, path or
 * query would produce a link that does not resolve.
 */
export function shareText(args: ShareTextArgs): string {
  const n = (v: number): string => localizeDigits(v, args.locale);
  const { home, away } = args.score;
  const mark = home > away ? args.labels.win : home === away ? args.labels.draw : args.labels.loss;

  return [
    `${args.labels.title} #${n(args.dayNumber)} · ${args.formationName}`,
    `${n(home)}–${n(away)} ${mark}`,
    args.strip,
    `🔥 ${n(args.currentStreak)}   🏆 ${n(args.bestStreak)}`,
    args.url,
  ].join("\n");
}
