import type { AlbumSeason } from "@/features/game/domain/album";
import { parseCardId } from "@/features/game/domain/card-id";
import type { ClassicData } from "@/features/game/domain/classic-data";
import { computeStats } from "@/features/game/domain/daily-stats";
import { isComplete } from "@/features/game/domain/season";
import { survivalProgress } from "@/features/game/domain/survival";
import { loadClassicSave } from "@/features/game/storage/classic-slot";
import { allDaily } from "@/features/game/storage/daily-slot";
import { loadRun } from "@/features/game/storage/season-slot";
import { loadSurvivalSave, type SavedSurvival } from "@/features/game/storage/survival-slot";
import type { AlbumCard } from "@/features/game/storage/trophy-slot";
import { loadWhatIfBests } from "@/features/game/storage/what-if-slot";
import { fetchSeason, leagueEnd, recordFullTime } from "./trophy-record";

/**
 * TASK-1813/1819 — fill the Trophy Room with what a coach did BEFORE it shipped, on open.
 *
 * ⭐ Every item is recorded through `recordFullTime` under the SAME key a full-time screen uses
 * (`d:<day>`, `s:<seed>:<week>`, `c:<seed>:<fixture>`, `r:<seed>`). Whichever gets there first
 * claims it, so a match recorded at full time is never counted again here, and running this
 * twice changes nothing.
 *
 * ⚠️ Match-level badges cannot be backfilled: saves keep results, never events. Best-effort
 * throughout — a missing save, an unreachable set list or a failed read just skips that item.
 */
export async function backfillTrophies(today: string): Promise<void> {
  const sets = new Map<number, Promise<AlbumSeason | null>>();
  const setFor = (season: number) => {
    if (!sets.has(season)) sets.set(season, fetchSeason(season));
    return sets.get(season)!;
  };
  /** A saved card id as an album card, read from its season's set list. */
  const cardsOf = async (ids: readonly string[], teamId?: number): Promise<AlbumCard[]> => {
    const out: AlbumCard[] = [];
    for (const id of ids) {
      try {
        const { season } = parseCardId(id as never);
        const set = await setFor(season);
        const club =
          set?.clubs.find(
            (c) => (teamId == null || c.teamId === teamId) && c.cards.some((x) => x.id === id),
          ) ?? null;
        const card = club?.cards.find((x) => x.id === id);
        if (club == null || card == null) continue;
        out.push({
          cardId: id,
          teamId: club.teamId,
          name: card.n,
          role: card.r,
          season,
          ovr: card.o,
        });
      } catch {
        // An unreadable id is simply not backfilled.
      }
    }
    return out;
  };
  const safe = async <T>(f: () => Promise<T>): Promise<T | null> => {
    try {
      return await f();
    } catch {
      return null;
    }
  };

  // The daily: every finished day's XI.
  const dailies = (await safe(allDaily)) ?? [];
  for (const d of dailies.filter((x) => x.done)) {
    await recordFullTime({
      key: `d:${d.day}`,
      day: d.day,
      cards: await cardsOf(d.cardIds),
      facts: {},
      context: "",
    });
  }

  // A Legacy-style season: each coach week's lineup, and the run if it is finished.
  const run = await safe(loadRun);
  if (run != null) {
    const lineup = await cardsOf(run.lineupIds ?? run.cardIds);
    for (const r of run.results.filter((x) => x.home === run.coach || x.away === run.coach)) {
      await recordFullTime({
        key: `s:${run.seed}:${r.week}`,
        day: today,
        cards: lineup,
        facts: {},
        context: "",
      });
    }
    if (isComplete(run)) {
      const { season, position } = leagueEnd(run.clubs, run.coach, run.results);
      await recordFullTime({
        key: `r:${run.seed}`,
        day: today,
        cards: [],
        facts: { season },
        context: `#${position}`,
      });
    }
  }

  // Classic and Survival: the coach's fixtures need the season's calendar to be told apart.
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
    const cards = await cardsOf(save.cardIds, save.clubId);
    for (const r of save.results) {
      const f = byId.get(r.fixtureId);
      if (f == null || (f.home !== coach && f.away !== coach)) continue;
      await recordFullTime({
        key: `c:${save.seed}:${r.fixtureId}`,
        day: today,
        cards,
        facts: {},
        context: "",
      });
    }
    if ("scenario" in save && save.scenario != null) {
      const p = await safe(async () =>
        survivalProgress(data.schedule, (save as SavedSurvival).scenario, save.results),
      );
      if (p?.complete)
        await recordFullTime({
          key: `r:${save.seed}`,
          day: today,
          cards: [],
          facts: {
            season: {
              kind: "survival",
              won: false,
              unbeaten: false,
              complete: true,
              survived: p.status === "survived",
            },
          },
          context: `#${p.position}`,
        });
    } else if (save.results.length >= data.schedule.fixtures.length) {
      const { season, position } = leagueEnd(
        data.schedule.clubs,
        coach,
        save.results.map((r) => ({ ...byId.get(r.fixtureId)!, ...r })),
      );
      await recordFullTime({
        key: `r:${save.seed}`,
        day: today,
        cards: [],
        facts: { season },
        context: `#${position}`,
      });
    }
  }

  // What the saves prove beyond single matches: the daily streak and the What-If rewrites.
  const best = dailies.length > 0 ? computeStats(dailies, today).bestStreak : 0;
  const rewritten = Object.values((await safe(loadWhatIfBests)) ?? {}).filter(
    (b) => b.verdict === "rewrote",
  ).length;
  await recordFullTime({
    key: `b:${today}`,
    day: today,
    cards: [],
    facts: { dailyBestStreak: best, whatIfRewritten: rewritten },
    context: "",
  });
}
