import { formatSeasonLabel } from "@/utils/season";

import type { RuleResult, TriviaRule } from "../types";

/** Below this a "late goals" claim is noise rather than a pattern. */
const MIN_LATE = 3;

/** A goal counts as late from the 90th minute on, stoppage time included. */
const LATE_FROM = 90;

/**
 * R27 (TASK-M82) — goals scored in the 90th minute or later.
 *
 * The first rule to read the raw event stream: 143,901 events were committed and the
 * facade could not see any of them. In 2024-25 alone 97 of 1,129 goals came at 90'+.
 *
 * `minute` is the clock minute and `extra` the stoppage-time offset, so a 90+4 goal is
 * `{ minute: 90, extra: 4 }` — testing `minute >= 90` catches both, and adding `extra`
 * would double-count it.
 */
export const lateDecidersRule: TriviaRule = {
  id: "R27",
  title: "Late deciders",
  scopes: ["league", "team"],
  async run(data, ctx): Promise<RuleResult | null> {
    const season = data.season;
    const events = await data.events(season);
    if (!events) return null;

    const teamId = ctx.scope === "team" ? ctx.id : undefined;
    if (ctx.scope === "team" && teamId === undefined) return null;

    let late = 0;
    let total = 0;
    for (const list of Object.values(events)) {
      for (const e of list) {
        if (e.type !== "Goal" || e.detail === "Own") continue;
        if (teamId !== undefined && e.teamId !== teamId) continue;
        total += 1;
        if (e.minute >= LATE_FROM) late += 1;
      }
    }
    if (late < MIN_LATE || total === 0) return null;
    const pct = Math.round((late / total) * 100);

    if (ctx.scope === "team") {
      const name = (await data.standings(season))?.find((s) => s.teamId === teamId)?.teamName;
      if (!name) return null;
      return {
        text: `${name} scored ${late} of their ${total} goals in ${formatSeasonLabel(season)} from the 90th minute onwards — ${pct}% of their season's goals arrived after the 90 were up.`,
        sources: [{ kind: "events", season }],
        async verify(dd) {
          const ev = await dd.events(season);
          if (!ev) return false;
          let n = 0;
          for (const list of Object.values(ev))
            for (const e of list)
              if (
                e.type === "Goal" &&
                e.detail !== "Own" &&
                e.teamId === teamId &&
                e.minute >= LATE_FROM
              )
                n += 1;
          return n === late;
        },
      };
    }

    return {
      text: `${late} of the ${total} goals scored in ${formatSeasonLabel(season)} came in the 90th minute or later — ${pct}% of the season's goals.`,
      sources: [{ kind: "events", season }],
      async verify(dd) {
        const ev = await dd.events(season);
        if (!ev) return false;
        let n = 0;
        for (const list of Object.values(ev))
          for (const e of list)
            if (e.type === "Goal" && e.detail !== "Own" && e.minute >= LATE_FROM) n += 1;
        return n === late;
      },
    };
  },
};
