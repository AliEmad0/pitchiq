import { formatSeasonLabel } from "@/utils/season";

import type { RuleResult, TriviaRule } from "../types";

const MIN_PENALTIES = 3;

/**
 * R29 (TASK-M82) — penalties and own goals, from the event stream.
 *
 * 1,379 penalties and 695 own goals across the archive, none of it aggregated anywhere.
 *
 * ⚠️ The `detail` field is what separates these from open play: `"Goal"`, `"Penalty"`,
 * `"Own"`. A rule that counts `type === "Goal"` alone silently folds all three together —
 * which is exactly why every other goal rule in this file excludes `detail === "Own"`.
 */
export const spotKicksAndOwnGoalsRule: TriviaRule = {
  id: "R29",
  title: "Spot kicks and own goals",
  scopes: ["league", "team"],
  async run(data, ctx): Promise<RuleResult | null> {
    const season = data.season;
    const events = await data.events(season);
    if (!events) return null;

    const teamId = ctx.scope === "team" ? ctx.id : undefined;
    if (ctx.scope === "team" && teamId === undefined) return null;

    let penalties = 0;
    let own = 0;
    let openPlay = 0;
    for (const list of Object.values(events)) {
      for (const e of list) {
        if (e.type !== "Goal") continue;
        if (teamId !== undefined && e.teamId !== teamId) continue;
        if (e.detail === "Penalty") penalties += 1;
        else if (e.detail === "Own") own += 1;
        else openPlay += 1;
      }
    }
    const scored = penalties + openPlay;
    if (penalties < MIN_PENALTIES || scored === 0) return null;
    const pct = Math.round((penalties / scored) * 100);

    const subject =
      ctx.scope === "team"
        ? ((await data.standings(season))?.find((s) => s.teamId === teamId)?.teamName ?? null)
        : null;
    if (ctx.scope === "team" && !subject) return null;

    const lead =
      subject !== null
        ? `${penalties} of ${subject}'s ${scored} goals in ${formatSeasonLabel(season)} came from the penalty spot (${pct}%)`
        : `${penalties} of the ${scored} goals scored in ${formatSeasonLabel(season)} came from the penalty spot (${pct}%)`;
    const tail = own > 0 ? `, and ${own} more were own goals.` : ".";

    return {
      text: `${lead}${tail}`,
      sources: [{ kind: "events", season }],
      async verify(dd) {
        const ev = await dd.events(season);
        if (!ev) return false;
        let p = 0;
        for (const list of Object.values(ev))
          for (const e of list)
            if (
              e.type === "Goal" &&
              e.detail === "Penalty" &&
              (teamId === undefined || e.teamId === teamId)
            )
              p += 1;
        return p === penalties && p >= MIN_PENALTIES;
      },
    };
  },
};
