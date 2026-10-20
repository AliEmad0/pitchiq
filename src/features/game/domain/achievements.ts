import { givenGoals } from "./match-headline";
import type { MatchResult, Side } from "./match-types";
import type { GamePlayer } from "./player";
import { SCENARIOS } from "./what-if";

/**
 * TASK-1813 — the Hall of Fame. Pure predicates over what the end of a match or a run already
 * provides; nothing here reads storage, the clock or entropy.
 *
 * ⛔ The id list is FROZEN in this order: unlocks are stored by id, and the cabinet renders in
 * this order, four cups to a shelf.
 */
export const ACHIEVEMENT_IDS = [
  "first-win",
  "clean-sheet",
  "thrashing",
  "hat-trick",
  "sparse-hat-trick",
  "comeback",
  "late-winner",
  "ten-men",
  "champions",
  "invincibles",
  "great-escape",
  "daily-7",
  "rewrite",
  "rewrite-all",
  "collector-100",
  "set-complete",
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

/** Each achievement's cup in the cabinet (owner's pick: Hall #1 Trophy Cabinet). */
const ICON: Record<AchievementId, string> = {
  "first-win": "⚽",
  "clean-sheet": "🧤",
  thrashing: "💥",
  "hat-trick": "🎩",
  "sparse-hat-trick": "📼",
  comeback: "🔥",
  "late-winner": "⏱",
  "ten-men": "🟥",
  champions: "🏆",
  invincibles: "🛡",
  "great-escape": "🪜",
  "daily-7": "📅",
  rewrite: "📺",
  "rewrite-all": "🌀",
  "collector-100": "📒",
  "set-complete": "⭐",
};
export const ACHIEVEMENTS: readonly { id: AchievementId; icon: string }[] = ACHIEVEMENT_IDS.map(
  (id) => ({ id, icon: ICON[id] }),
);

const THRASHING_MARGIN = 5;
const COMEBACK_DEFICIT = 2;
const LATE_MINUTE = 90;
const DAILY_STREAK = 7;
const COLLECTOR = 100;

/** What one finished match says about the coach — read from HIS side, home or away. */
export interface MatchFacts {
  won: boolean;
  for: number;
  against: number;
  /** His worst deficit at any point (0 if never behind). */
  maxDeficit: number;
  /** He won, and the goal that last took him from level to ahead came at 90' or later. */
  lateTieBreaker: boolean;
  /** One of his men was sent off. */
  coachRed: boolean;
  /** His men who scored three or more (own goals credit nobody). */
  hatTricks: { playerId: number; sparse: boolean }[];
}

export function matchFacts(
  result: MatchResult,
  coachSide: Side,
  coachPlayers: readonly GamePlayer[],
): MatchFacts {
  const goals = givenGoals(result.events);
  const mine = goals.filter((e) => e.side === coachSide).length;
  const theirs = goals.length - mine;
  let run = 0;
  let worst = 0;
  let lastTieBreak = -1;
  for (const e of goals) {
    if (e.side === coachSide && run === 0) lastTieBreak = e.minute;
    run += e.side === coachSide ? 1 : -1;
    worst = Math.min(worst, run);
  }
  const won = mine > theirs;
  const tally = new Map<number, number>();
  for (const e of goals) {
    if (e.side !== coachSide || e.source === "own-goal" || e.playerId == null) continue;
    tally.set(e.playerId, (tally.get(e.playerId) ?? 0) + 1);
  }
  const hatTricks = [...tally]
    .filter(([, n]) => n >= 3)
    .map(([playerId]) => ({
      playerId,
      sparse: coachPlayers.find((p) => p.playerId === playerId)?.provenance?.tier === "sparse",
    }));
  return {
    won,
    for: mine,
    against: theirs,
    maxDeficit: -worst,
    lateTieBreaker: won && lastTieBreak >= LATE_MINUTE,
    coachRed: result.events.some(
      (e) => e.kind === "card" && e.card === "red" && e.side === coachSide,
    ),
    hatTricks,
  };
}

/** Everything a career can show at one moment; each part is optional. */
export interface CareerFacts {
  /** A match he PLAYED — never a simmed one, or bulk sim would farm these. */
  match?: MatchFacts;
  season?: {
    kind: "league" | "survival";
    won: boolean;
    unbeaten: boolean;
    complete: boolean;
    survived?: boolean;
  };
  dailyBestStreak?: number;
  whatIfRewritten?: number;
  albumTotal?: number;
  setsComplete?: number;
}

/** Every achievement these facts satisfy, in the frozen order. */
export function earned(f: CareerFacts): AchievementId[] {
  const out = new Set<AchievementId>();
  const m = f.match;
  if (m != null && m.won) {
    out.add("first-win");
    if (m.against === 0) out.add("clean-sheet");
    if (m.for - m.against >= THRASHING_MARGIN) out.add("thrashing");
    if (m.maxDeficit >= COMEBACK_DEFICIT) out.add("comeback");
    if (m.lateTieBreaker) out.add("late-winner");
    if (m.coachRed) out.add("ten-men");
  }
  // A hat-trick is the player's feat, so it stands whatever the result.
  if (m != null && m.hatTricks.length > 0) out.add("hat-trick");
  if (m != null && m.hatTricks.some((h) => h.sparse)) out.add("sparse-hat-trick");
  const s = f.season;
  if (s != null && s.complete) {
    if (s.kind === "league" && s.won) out.add("champions");
    if (s.kind === "league" && s.unbeaten) out.add("invincibles");
    if (s.kind === "survival" && s.survived === true) out.add("great-escape");
  }
  if ((f.dailyBestStreak ?? 0) >= DAILY_STREAK) out.add("daily-7");
  if ((f.whatIfRewritten ?? 0) >= 1) out.add("rewrite");
  if ((f.whatIfRewritten ?? 0) >= SCENARIOS.length) out.add("rewrite-all");
  if ((f.albumTotal ?? 0) >= COLLECTOR) out.add("collector-100");
  if ((f.setsComplete ?? 0) >= 1) out.add("set-complete");
  return ACHIEVEMENT_IDS.filter((id) => out.has(id));
}

/** The catalog key for an id (`gameTrophies.name.<key>`): next-intl keys avoid dashes. */
export function achievementKey(id: AchievementId): string {
  return id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
}
