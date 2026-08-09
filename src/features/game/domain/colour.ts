import type { GoalStyle, Weather } from "./match-types";
import type { GamePlayer } from "./player";

/**
 * TASK-1822 Phase 5 — colour.
 *
 * How a goal was scored, own goals, the weather and the crowd. None of it decides who
 * wins; all of it decides whether the match is worth watching.
 */

/**
 * Own goals per match. The Premier League runs about one every ten games.
 *
 * Like every other way of putting the ball in the net, this comes OUT of the open-play
 * target rather than on top of it — see `openPlayTarget`.
 */
export const OWN_GOAL_PER_MATCH = 0.11;

const WEATHER_BRANCHES: [Weather, number][] = [
  ["clear", 0.55],
  ["rain", 0.24],
  ["wind", 0.12],
  ["heavy-rain", 0.07],
  ["snow", 0.02],
];

export function pickWeather(r: number): Weather {
  let acc = 0;
  for (const [weather, weight] of WEATHER_BRANCHES) {
    acc += weight;
    if (r < acc) return weather;
  }
  return "clear";
}

/**
 * How much harder the conditions make it to stay on your feet.
 *
 * ⚠️ Weather deliberately does NOT touch the goal rate. A wet pitch makes a match
 * scrappier — more slips, more mistimed tackles, more cards — but inflating goals for
 * atmosphere would quietly break the season-authentic calibration that every phase has
 * been protecting. Colour must be free.
 */
export function slipFactor(weather: Weather): number {
  switch (weather) {
    case "heavy-rain":
      return 1.45;
    case "snow":
      return 1.4;
    case "rain":
      return 1.2;
    case "wind":
      return 1.1;
    default:
      return 1;
  }
}

/**
 * Goal styles weighted by the scorer's role.
 *
 * A centre-back who scores has almost always headed one in from a set piece; a winger
 * has curled it or gone past someone. Deriving the description from the role is what
 * stops the commentary reading like a random phrase generator.
 */
const STYLE_BY_ROLE: Record<string, [GoalStyle, number][]> = {
  GK: [["header", 1]],
  CB: [
    ["header", 0.72],
    ["tap-in", 0.16],
    ["volley", 0.12],
  ],
  RB: [
    ["long-range", 0.34],
    ["header", 0.22],
    ["counter", 0.24],
    ["tap-in", 0.2],
  ],
  CDM: [
    ["long-range", 0.46],
    ["header", 0.24],
    ["volley", 0.18],
    ["tap-in", 0.12],
  ],
  CM: [
    ["long-range", 0.36],
    ["counter", 0.22],
    ["volley", 0.18],
    ["tap-in", 0.14],
    ["header", 0.1],
  ],
  CAM: [
    ["chip", 0.24],
    ["trivela", 0.22],
    ["long-range", 0.22],
    ["counter", 0.18],
    ["volley", 0.14],
  ],
  LW: [
    ["trivela", 0.34],
    ["counter", 0.26],
    ["chip", 0.18],
    ["long-range", 0.14],
    ["tap-in", 0.08],
  ],
  CF: [
    ["tap-in", 0.3],
    ["header", 0.22],
    ["volley", 0.18],
    ["counter", 0.16],
    ["chip", 0.14],
  ],
};
STYLE_BY_ROLE.LB = STYLE_BY_ROLE.RB;
STYLE_BY_ROLE.RM = STYLE_BY_ROLE.LW;
STYLE_BY_ROLE.LM = STYLE_BY_ROLE.LW;
STYLE_BY_ROLE.RW = STYLE_BY_ROLE.LW;
STYLE_BY_ROLE.SS = STYLE_BY_ROLE.CF;

const DEFAULT_STYLE: [GoalStyle, number][] = [
  ["tap-in", 0.3],
  ["long-range", 0.25],
  ["counter", 0.2],
  ["header", 0.15],
  ["volley", 0.1],
];

export function goalStyleFor(scorer: GamePlayer | null, r: number): GoalStyle {
  const table = (scorer?.role != null ? STYLE_BY_ROLE[scorer.role] : null) ?? DEFAULT_STYLE;
  let acc = 0;
  for (const [style, weight] of table) {
    acc += weight;
    if (r < acc) return style;
  }
  return table[table.length - 1][0];
}

/** Per-minute chance the home crowd turns on the visitors. */
export const CROWD_PER_MATCH = 0.5;
