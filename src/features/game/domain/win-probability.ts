import type { TeamPower } from "./match-types";

export interface WinProbability {
  home: number;
  draw: number;
  away: number;
}

export interface WinProbInput {
  homePower: TeamPower;
  awayPower: TeamPower;
  homeScore: number;
  awayScore: number;
  minute: number;
}

const FULL_TIME = 90;
const BASE_RATE = 0.015; // ~1.35 goals/side over 90' at parity
const MAX_GOALS = 10;

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p = (p * lambda) / i;
  return p;
}

/** Attack-vs-opponent-defense edge; 1 at parity, >1 when attack outweighs defense. */
function edge(attack: number, oppDefense: number): number {
  return attack / ((attack + oppDefense) / 2 + 1);
}

/** Three-way win/draw/loss probability from power, current score and time left. */
export function winProbability(input: WinProbInput): WinProbability {
  const remaining = Math.max(0, FULL_TIME - input.minute);
  const lambdaHome = BASE_RATE * remaining * edge(input.homePower.attack, input.awayPower.defense);
  const lambdaAway = BASE_RATE * remaining * edge(input.awayPower.attack, input.homePower.defense);

  let home = 0,
    draw = 0,
    away = 0;
  for (let gh = 0; gh <= MAX_GOALS; gh++) {
    const ph = poissonPmf(gh, lambdaHome);
    for (let ga = 0; ga <= MAX_GOALS; ga++) {
      const p = ph * poissonPmf(ga, lambdaAway);
      const fh = input.homeScore + gh;
      const fa = input.awayScore + ga;
      if (fh > fa) home += p;
      else if (fh < fa) away += p;
      else draw += p;
    }
  }
  const total = home + draw + away || 1;
  return { home: home / total, draw: draw / total, away: away / total };
}
