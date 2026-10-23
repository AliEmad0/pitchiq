import type { ClassicData } from "@/features/game/domain/classic-data";
import { isComplete } from "@/features/game/domain/season";
import type { CareerEntry, CareerMatch, CareerRun } from "@/features/game/domain/records";
import { survivalProgress } from "@/features/game/domain/survival";
import { logCareer } from "@/features/game/storage/career-slot";
import { loadClassicSave } from "@/features/game/storage/classic-slot";
import { loadMarketRun } from "@/features/game/storage/market-slot";
import { loadRun } from "@/features/game/storage/season-slot";
import { loadSurvivalSave, type SavedSurvival } from "@/features/game/storage/survival-slot";
import { leagueEnd, runContext } from "./trophy-record";

/**
 * TASK-1812 — seed the career log, on the Records page's first open, with what the saves still
 * hold from BEFORE the log existed: the current season, Classic and Survival runs and the
 * current Market run.
 *
 * ⭐ Logged under the SAME keys a full-time screen uses (`s:`, `c:`, `k:`, `r:`), and the log
 * refuses a key twice, so a match recorded live is never counted again and running this twice
 * changes nothing. `at` is a small ordinal so backfilled matches sort before anything logged
 * live, which is stamped with the clock.
 *
 * ⚠️ Only the LATEST run per mode survives in the saves; anything older is gone and the page
 * says so. Best-effort throughout — a failed read just skips that source.
 */
export async function backfillCareer(today: string): Promise<void> {
  const safe = async <T>(f: () => Promise<T>): Promise<T | null> => {
    try {
      return await f();
    } catch {
      return null;
    }
  };
  let order = 0;
  type Unstamped = Omit<CareerMatch, "at" | "day"> | Omit<CareerRun, "at" | "day">;
  const log = (e: Unstamped) => logCareer({ ...e, at: ++order, day: today } as CareerEntry);

  const run = await safe(loadRun);
  if (run != null) {
    for (const r of run.results) {
      if (r.home !== run.coach && r.away !== run.coach) continue;
      const home = r.home === run.coach;
      await log({
        kind: "match",
        key: `s:${run.seed}:${r.week}`,
        mode: "season",
        gf: home ? r.homeGoals : r.awayGoals,
        ga: home ? r.awayGoals : r.homeGoals,
        context: "",
      });
    }
    if (isComplete(run)) {
      const { season, position } = leagueEnd(run.clubs, run.coach, run.results);
      await log({
        kind: "run",
        key: `r:${run.seed}`,
        mode: "season",
        position,
        clubs: run.clubs,
        won: season.won,
        unbeaten: season.unbeaten,
        context: runContext(null, position, run.clubs),
      });
    }
  }

  for (const save of [await safe(loadClassicSave), await safe(loadSurvivalSave)]) {
    if (save == null) continue;
    const data = await safe(async () => {
      const res = await fetch(`/api/game/classic/${save.season}`);
      return res.ok ? ((await res.json()) as ClassicData) : null;
    });
    if (data?.schedule?.fixtures == null) continue;
    const coach = data.clubIds.indexOf(save.clubId);
    if (coach < 0) continue;
    const byId = new Map(data.schedule.fixtures.map((f) => [f.id, f]));
    for (const r of save.results) {
      const f = byId.get(r.fixtureId);
      if (f == null || (f.home !== coach && f.away !== coach)) continue;
      const home = f.home === coach;
      await log({
        kind: "match",
        key: `c:${save.seed}:${r.fixtureId}`,
        mode: "classic",
        gf: home ? r.homeGoals : r.awayGoals,
        ga: home ? r.awayGoals : r.homeGoals,
        context: "",
      });
    }
    const name = data.squads?.find((c) => c.teamId === save.clubId)?.name ?? null;
    if ("scenario" in save && save.scenario != null) {
      const p = await safe(async () =>
        survivalProgress(data.schedule!, (save as SavedSurvival).scenario, save.results),
      );
      if (p?.complete) {
        await log({
          kind: "run",
          key: `r:${save.seed}`,
          mode: "classic",
          position: p.position,
          clubs: data.schedule.clubs,
          won: false,
          unbeaten: false,
          survived: p.status === "survived",
          context: runContext(name, p.position, data.schedule.clubs),
        });
      }
    } else if (save.results.length >= data.schedule.fixtures.length) {
      const { season, position } = leagueEnd(
        data.schedule.clubs,
        coach,
        save.results.map((r) => ({ ...byId.get(r.fixtureId)!, ...r })),
      );
      await log({
        kind: "run",
        key: `r:${save.seed}`,
        mode: "classic",
        position,
        clubs: data.schedule.clubs,
        won: season.won,
        unbeaten: season.unbeaten,
        context: runContext(name, position, data.schedule.clubs),
      });
    }
  }

  const market = await safe(loadMarketRun);
  if (market != null) {
    for (const r of market.results) {
      await log({
        kind: "match",
        key: `k:${market.seed}:${r.round}`,
        mode: "market",
        gf: r.gf,
        ga: r.ga,
        context: "",
      });
    }
  }
}
