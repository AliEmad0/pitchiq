/**
 * Gallery data for TASK-1813/1819/1825: real club-season squads (the Classic pool, i.e. the
 * album's set definition), set-size measurements over every season, and squad rating means
 * for the scouting concept. Run from the repo root:
 *   npx tsx --conditions=react-server design/trophy-gallery/extract.ts > design/trophy-gallery/data.json
 */
import { loadClassicData } from "@/features/game/adapter/classic-data";

const PICK: [number, string][] = [
  [2003, "Arsenal"],
  [2007, "Man"],
  [2015, "Leicester"],
  [1994, "Blackburn"],
];

async function main() {
  const sets: unknown[] = [];
  const sizes: number[] = [];
  const means: {
    club: string;
    teamId: number;
    season: number;
    att: number;
    cre: number;
    def: number;
    phy: number;
  }[] = [];
  for (let season = 1992; season <= 2025; season++) {
    const d = await loadClassicData(season);
    if (!d) continue;
    for (const c of d.squads) {
      sizes.push(c.pool.length);
      const out = c.pool.filter((p) => p.role !== "GK");
      const m = (k: "attack" | "creation" | "defense" | "physical") =>
        Math.round(out.reduce((a, p) => a + p.ratings[k], 0) / Math.max(1, out.length));
      means.push({
        club: c.name,
        teamId: c.teamId,
        season,
        att: m("attack"),
        cre: m("creation"),
        def: m("defense"),
        phy: m("physical"),
      });
      if (PICK.some(([s, n]) => s === season && c.name.startsWith(n)) && sets.length < 6)
        sets.push({
          club: c.name,
          teamId: c.teamId,
          season,
          cards: c.pool
            .map((p) => ({
              id: p.cardId,
              n: p.name,
              r: p.role,
              o: p.ratings.overall,
              ph: p.bio?.photoUrl ?? null,
            }))
            .sort((a, b) => b.o - a.o),
        });
    }
  }
  sizes.sort((a, b) => a - b);
  const stats = {
    clubSeasons: sizes.length,
    totalCards: sizes.reduce((a, b) => a + b, 0),
    min: sizes[0],
    median: sizes[Math.floor(sizes.length / 2)],
    max: sizes[sizes.length - 1],
  };
  process.stdout.write(JSON.stringify({ stats, sets, means }));
}
main();
