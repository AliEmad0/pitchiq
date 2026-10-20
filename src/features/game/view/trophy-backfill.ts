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
import { type AlbumCard, isClaimed } from "@/features/game/storage/trophy-slot";
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
  /**
   * Saved card ids as album cards, read from their seasons' set lists.
   *
   * ⛔ NULL when any of those lists could not be fetched: the item is then left UNRECORDED (its
   * key unclaimed), so the next open — with the network back — fills it. Recording it with
   * missing cards would claim the key and lose them for good.
   */
  const cardsOf = async (ids: readonly string[], teamId?: number): Promise<AlbumCard[] | null> => {
    const out: AlbumCard[] = [];
    for (const id of ids) {
      let season: number;
      try {
        season = parseCardId(id as never).season;
      } catch {
        continue; // An unreadable id is simply not backfilled.
      }
      const set = await setFor(season);
      if (set == null) return null;
      const holders = set.clubs.filter(
        (c) => (teamId == null || c.teamId === teamId) && c.cards.some((x) => x.id === id),
      );
      // ⚠️ A saved daily keeps card ids, not clubs. A man in TWO clubs' sets (a mid-season
      // transfer) cannot be placed, so he is skipped: absent beats wrong.
      const club = holders.length === 1 ? holders[0]! : null;
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
    }
    return out;
  };
  /** Record one saved item under its full-time key — skipped if already recorded or unresolvable. */
  const item = async (key: string, day: string, ids: readonly string[], teamId?: number) => {
    if (await isClaimed(key)) return;
    const cards = await cardsOf(ids, teamId);
    if (cards == null) return;
    await recordFullTime({ key, day, cards, facts: {}, context: "" });
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
  for (const d of dailies.filter((x) => x.done)) await item(`d:${d.day}`, d.day, d.cardIds);

  // A Legacy-style season: each coach week's lineup, and the run if it is finished.
  const run = await safe(loadRun);
  if (run != null) {
    const coachClub = run.leagueIds?.[run.coach];
    for (const r of run.results.filter((x) => x.home === run.coach || x.away === run.coach)) {
      await item(
        `s:${run.seed}:${r.week}`,
        today,
        run.lineupIds ?? run.cardIds,
        coachClub != null && coachClub > 0 ? coachClub : undefined,
      );
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
    for (const r of save.results) {
      const f = byId.get(r.fixtureId);
      if (f == null || (f.home !== coach && f.away !== coach)) continue;
      await item(`c:${save.seed}:${r.fixtureId}`, today, save.cardIds, save.clubId);
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
