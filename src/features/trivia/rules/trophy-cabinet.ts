import type { RuleResult, TriviaRule } from "../types";

const MIN_TROPHIES = 5;

/**
 * R30 (TASK-M82) — a player's career silverware and what it cost.
 *
 * ⚠️ **Reads the row, not `player-honours.json`.** The detail map is 5 MB and its loader
 * is build-time only; the trivia route is `revalidate = 0`, so reading it here would be
 * the Fluid Active-CPU shape TASK-M71 fixed. The `enrichment` summary carried on every
 * player row (TASK-M93) has the same trophy count for free.
 *
 * ⚠️ `trophies` is SILVERWARE ONLY — 25,886 of the 29,761 committed honour groups are
 * *participation* and 1,597 runner-up. Quoting the honour count instead would claim a
 * squad medal as a trophy.
 *
 * ⚠️ `careerFee` is a DISPLAY STRING ("€52.60m"), never a number. It is interpolated
 * verbatim; coercing it would invent a fee for the loans and frees.
 */
export const trophyCabinetRule: TriviaRule = {
  id: "R30",
  title: "Trophy cabinet",
  scopes: ["player"],
  async run(data, ctx): Promise<RuleResult | null> {
    if (ctx.scope !== "player" || ctx.id === undefined) return null;
    const id = ctx.id;
    const season = data.season;
    const p = (await data.players(season))?.find((x) => x.id === id);
    const e = p?.enrichment;
    if (!p || !e || e.trophies < MIN_TROPHIES) return null;

    const fee = e.careerFee;
    const feeClause = fee && fee !== "-" && fee !== "?" ? ` His career moves totalled ${fee}.` : "";

    return {
      text: `${p.name} has won ${e.trophies} major honours across his career — from ${e.honours} honour listings in all.${feeClause}`,
      sources: [{ kind: "players", season, playerId: id }],
      async verify(dd) {
        const q = (await dd.players(season))?.find((x) => x.id === id);
        return q?.enrichment?.trophies === e.trophies && e.trophies >= MIN_TROPHIES;
      },
    };
  },
};

const MIN_CAPS = 50;

/**
 * R31 (TASK-M82) — the international double life.
 *
 * Same reasoning as R30: `caps` and `internationalGoals` ride on the row, so this costs
 * nothing beyond the players read every other rule already does.
 *
 * ⚠️ Both fields are NULLABLE and null means **unknown**, not zero. A player with no
 * committed cap record must not be described as uncapped.
 */
export const internationalDoubleLifeRule: TriviaRule = {
  id: "R31",
  title: "International double life",
  scopes: ["player"],
  async run(data, ctx): Promise<RuleResult | null> {
    if (ctx.scope !== "player" || ctx.id === undefined) return null;
    const id = ctx.id;
    const season = data.season;
    const p = (await data.players(season))?.find((x) => x.id === id);
    const caps = p?.enrichment?.caps ?? null;
    const goals = p?.enrichment?.internationalGoals ?? null;
    if (!p || caps === null || caps < MIN_CAPS) return null;

    const goalClause =
      goals !== null && goals > 0
        ? ` and scored ${goals} international goals`
        : goals === null
          ? ""
          : " without scoring for them";

    return {
      text: `${p.name} has won ${caps} caps for his country${goalClause}.`,
      sources: [{ kind: "players", season, playerId: id }],
      async verify(dd) {
        const q = (await dd.players(season))?.find((x) => x.id === id);
        const c = q?.enrichment?.caps ?? null;
        return c !== null && c === caps && c >= MIN_CAPS;
      },
    };
  },
};
