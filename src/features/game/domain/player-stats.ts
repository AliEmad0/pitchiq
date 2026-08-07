import type { Player } from "@/data/schemas";
import { type StatBag, minutesOf, per90, successRate } from "./stat-pool";

/**
 * Stat extraction — the SINGLE place this dataset's denominator defects are handled.
 *
 * Three rules, each verified against committed data. A future edit that "simplifies"
 * any of them will silently corrupt every rating:
 *
 *  1. `duels` is TOTAL involvements, not won + lost (Wan-Bissaka '18: 377 vs 171).
 *     Duel rates use `duelsWon + duelsLost`.
 *  2. `tackles` IS `tacklesWon + tacklesLost` (Wan-Bissaka '18: 129 = 129). Tackle
 *     rate is `tacklesWon / tackles`; adding tacklesLost again double-counts.
 *  3. Aerial duels are NOT derivable — `duelsWon - groundDuelsWon` goes negative for
 *     16 of 49 qualifying CBs in 2018/19 (Ben Davies -29, Holgate -35), so the two
 *     fields use different definitions and are not subsets. There is deliberately no
 *     aerial stat here, and the dataset has no take-ons-faced field either
 *     (`unsuccessfulDribbles` is the player's OWN failed dribbles).
 */

export const OUTFIELD_KEYS = [
  "minutes",
  "goals90",
  "xg90",
  "sot90",
  "assists90",
  "keyPasses90",
  "passAccuracy",
  "duelPct",
  "groundPct",
  "tacklePct",
  "gcPrevented90",
  "tackles90",
  "interceptions90",
  "clearances90",
  "blocks90",
  "duelsWon90",
  "foulsWon90",
  "foulsConceded90",
  "cardScore",
  "cleanSheetRate",
] as const;

export const GK_KEYS = [
  "minutes",
  "savePct",
  "saves90",
  "gcPrevented90",
  "cleanSheetRate",
  "passAccuracy",
  "longPasses90",
  "gcOutsideBoxPrevented90",
  "penaltyGcPrevented90",
  "duelsWon90",
  "clearances90",
  "cardScore",
] as const;

/** Conceding is bad, so invert it — every pool ranks "higher is better". */
const negate = (v: number | null): number | null => (v == null ? null : -v);

const cleanSheetRate = (p: Player): number | null => {
  const apps = p.metrics.appearances ?? 0;
  const cs = p.metrics.cleanSheets;
  return apps > 0 && cs != null ? cs / apps : null;
};

const cardScore = (p: Player): number =>
  (p.metrics.yellowCards ?? 0) + 2 * (p.metrics.redCards ?? 0);

export function outfieldStats(p: Player): StatBag {
  const m = p.metrics;
  const x = m.extended;
  const minutes = minutesOf(p);
  return {
    minutes,
    goals90: per90(m.goals, minutes),
    xg90: per90(m.xg ?? null, minutes),
    sot90: per90(m.shotsOnTarget, minutes),
    assists90: per90(m.assists, minutes),
    keyPasses90: per90(m.keyPasses, minutes),
    passAccuracy: m.passAccuracy ?? null,
    duelPct: successRate(m.duelsWon, x?.duelsLost),
    groundPct: successRate(x?.groundDuelsWon, x?.groundDuelsLost),
    // Rule 2: `tackles` is already won + lost, so this is a plain share.
    tacklePct:
      x?.tacklesWon != null && m.tackles != null && m.tackles > 0
        ? (100 * x.tacklesWon) / m.tackles
        : null,
    gcPrevented90: negate(per90(x?.goalsConceded ?? null, minutes)),
    tackles90: per90(m.tackles, minutes),
    interceptions90: per90(m.interceptions, minutes),
    clearances90: per90(x?.clearances ?? null, minutes),
    blocks90: per90(x?.blocks ?? null, minutes),
    duelsWon90: per90(m.duelsWon, minutes),
    foulsWon90: per90(x?.foulsWon ?? null, minutes),
    foulsConceded90: per90(x?.foulsConceded ?? null, minutes),
    cardScore: cardScore(p),
    cleanSheetRate: cleanSheetRate(p),
  };
}

export function gkStats(p: Player): StatBag {
  const m = p.metrics;
  const x = m.extended;
  const minutes = minutesOf(p);
  return {
    minutes,
    // Shots faced = saves + goals conceded; `saves` exists only from 2008.
    savePct: successRate(m.saves ?? null, x?.goalsConceded ?? null),
    saves90: per90(m.saves ?? null, minutes),
    gcPrevented90: negate(per90(x?.goalsConceded ?? null, minutes)),
    cleanSheetRate: cleanSheetRate(p),
    passAccuracy: m.passAccuracy ?? null,
    longPasses90: per90(x?.successfulLongPasses ?? null, minutes),
    // Beaten from distance reads as mispositioned.
    gcOutsideBoxPrevented90: negate(per90(x?.goalsConcededOutsideBox ?? null, minutes)),
    penaltyGcPrevented90: negate(per90(x?.penaltyGoalsConceded ?? null, minutes)),
    // Command of the area: a keeper leaving their line for crosses. Duel COUNTS are
    // reliable here — it is the `duels` denominator that is not (rule 1).
    duelsWon90: per90(m.duelsWon, minutes),
    clearances90: per90(x?.clearances ?? null, minutes),
    cardScore: cardScore(p),
  };
}
