import { describe, expect, it } from "vitest";
import { loadClassicData } from "@/features/game/adapter/classic-data";
import type { ClassicData } from "@/features/game/domain/classic-data";
import type { Modifier } from "@/features/game/domain/match-types";
import { BASELINE_MODIFIERS } from "@/features/game/domain/modifiers";
import { SCENARIOS, type Scenario } from "@/features/game/domain/what-if";
import { buildWhatIfSession } from "@/features/game/view/what-if-session";

/**
 * TASK-1816 — a scenario becomes a match: both clubs' REAL club-season squads (Classic's
 * prerendered season data), the real starting XI where every name maps onto the pool, the
 * real prior goals as the engine's start state, and the season's real substitution rules.
 */
const byId = (id: string) => SCENARIOS.find((s) => s.id === id)!;
const cache = new Map<number, ClassicData>();
async function data(season: number): Promise<ClassicData> {
  if (!cache.has(season)) cache.set(season, (await loadClassicData(season))!);
  return cache.get(season)!;
}
const names = (ps: { name: string }[]) => ps.map((p) => p.name).sort();

describe("buildWhatIfSession", () => {
  it("every scenario builds a legal session from its season's data", async () => {
    for (const s of SCENARIOS) {
      const session = buildWhatIfSession(s, await data(s.season), 1);
      expect(session, s.id).not.toBeNull();
      expect(session!.setup.home.players, s.id).toHaveLength(11);
      expect(session!.setup.away.players, s.id).toHaveLength(11);
      expect(session!.setup.home.bench!.length, s.id).toBeGreaterThan(0);
    }
  }, 60_000);

  it("uses the REAL starting XI when every name maps (Newcastle v Arsenal, 2011)", async () => {
    const s = byId("2011-new-ars");
    const session = buildWhatIfSession(s, await data(s.season), 1)!;
    expect(session.xiSource.home).toBe("real");
    expect(names(session.setup.home.players)).toEqual([...s.realXi.home].sort());
  }, 60_000);

  it("falls back to the best legal XI when one name does not map, and says so", async () => {
    const s = byId("2011-new-ars");
    const broken: Scenario = {
      ...s,
      realXi: { ...s.realXi, home: ["Nobody Real", ...s.realXi.home.slice(1)] },
    };
    const session = buildWhatIfSession(broken, await data(s.season), 1)!;
    expect(session.xiSource.home).toBe("best");
    expect(session.setup.home.players).toHaveLength(11);
  }, 60_000);

  it("the start state comes from the scenario: minute, prior goals, subs, coach's team talk", async () => {
    const s = byId("2011-new-ars");
    const { setup } = buildWhatIfSession(s, await data(s.season), 1)!;
    expect(setup.startState).toMatchObject({
      minute: 26,
      subsUsed: { home: 0, away: 0 },
      teamTalk: "home",
    });
    const goals = setup.startState!.priorEvents.filter((e) => e.kind === "goal");
    expect(goals.map((g) => [g.minute, g.side])).toEqual([
      [1, "away"],
      [3, "away"],
      [10, "away"],
      [26, "away"],
    ]);
    expect(setup.substitutions).toBeDefined();
  }, 60_000);

  it("the coach is AWAY when the scenario says so (Man United at Spurs, 2001)", async () => {
    const s = byId("2001-tot-mun");
    const { setup } = buildWhatIfSession(s, await data(s.season), 1)!;
    expect(setup.startState!.teamTalk).toBe("away");
    expect(setup.away.name).toMatch(/Man/);
  }, 60_000);

  it("⛔ real substitutions before the start are APPLIED where they seat, and only those are charged", async () => {
    // Review finding #2: Spurs v Man United 2001 starts at 45' with two real United changes —
    // Silvestre for Irwin (45', LB for LB) and Solskjær for Butt (40', a striker for the
    // holding midfielder: three strikers no supported shape can seat legally). They used to
    // be charged while the men really taken off still played. Now the legal change is
    // applied and charged; the one that cannot be seated is skipped and NOT charged.
    const s = byId("2001-tot-mun");
    const { setup, xiSource } = buildWhatIfSession(s, await data(s.season), 1)!;
    expect(xiSource.away).toBe("real");
    const xi = setup.away.players.map((p) => p.name);
    expect(xi).toContain("Mikaël Silvestre");
    expect(xi).not.toContain("Denis Irwin");
    expect(xi).toContain("Nicky Butt");
    expect((setup.away.bench ?? []).map((p) => p.name)).not.toContain("Denis Irwin");
    expect(setup.startState!.subsUsed.away).toBe(1);
  }, 60_000);

  it("a substitution that cannot be applied is not charged", async () => {
    const s = byId("2001-tot-mun");
    const ghost: Scenario = {
      ...s,
      before: s.before.map((e) => (e.kind === "sub" ? { ...e, off: "Nobody Real" } : e)),
    };
    const { setup } = buildWhatIfSession(ghost, await data(s.season), 1)!;
    expect(setup.startState!.subsUsed.away).toBe(0);
    expect(setup.away.players.map((p) => p.name)).toContain("Nicky Butt");
  }, 60_000);

  it("a real red card before the start resolves to a player on that side's XI", async () => {
    const s = byId("2011-new-ars");
    const victim = s.realXi.home[1]!;
    const withRed: Scenario = {
      ...s,
      before: [
        ...s.before,
        { minute: 20, side: "home", kind: "red", player: victim, off: null, ownGoal: false },
      ],
    };
    const { setup } = buildWhatIfSession(withRed, await data(s.season), 1)!;
    const red = setup.startState!.priorEvents.find((e) => e.kind === "card")!;
    expect(red).toMatchObject({ card: "red", side: "home" });
    expect(setup.home.players.find((p) => p.playerId === red.playerId)?.name).toBe(victim);
  }, 60_000);

  it("⛔ a real red card for a man we cannot place still leaves the side a man down", async () => {
    // Review finding #3: the red used to be dropped silently, so a match that was really
    // 11 v 10 played 11 v 11. The numbers are history; when the man cannot be named, the
    // side's lowest-rated outfielder makes way.
    const s = byId("2011-new-ars");
    const withRed: Scenario = {
      ...s,
      before: [
        ...s.before,
        { minute: 20, side: "home", kind: "red", player: "Nobody Real", off: null, ownGoal: false },
      ],
    };
    const { setup } = buildWhatIfSession(withRed, await data(s.season), 1)!;
    const reds = setup.startState!.priorEvents.filter((e) => e.kind === "card");
    expect(reds).toHaveLength(1);
    const id = reds[0]!.playerId!;
    const man = setup.home.players.find((p) => p.playerId === id)!;
    expect(man.role).not.toBe("GK");
    const outfield = setup.home.players.filter((p) => p.role !== "GK");
    expect(man.ratings!.overall).toBe(Math.min(...outfield.map((p) => p.ratings!.overall)));
  }, 60_000);

  it("every shipped scenario resolves exactly its real number of red cards", async () => {
    for (const s of SCENARIOS) {
      const { setup } = buildWhatIfSession(s, await data(s.season), 1)!;
      const reds = setup.startState!.priorEvents.filter((e) => e.kind === "card");
      expect(
        reds.filter((e) => e.side === "home"),
        s.id,
      ).toHaveLength(s.sentOffBefore.home);
      expect(
        reds.filter((e) => e.side === "away"),
        s.id,
      ).toHaveLength(s.sentOffBefore.away);
    }
  }, 60_000);

  it("passed modifiers land in setup.modifiers; the baseline list is untouched", async () => {
    const s = byId("2011-new-ars");
    const before = BASELINE_MODIFIERS.length;
    const boost: Modifier = () => ({});
    const { setup } = buildWhatIfSession(s, await data(s.season), 1, [boost])!;
    expect(setup.modifiers).toEqual([boost]);
    expect(BASELINE_MODIFIERS).toHaveLength(before);
  }, 60_000);

  it("returns null when a club is missing from the season data", async () => {
    const s = byId("2011-new-ars");
    const d = await data(s.season);
    const missing: ClassicData = { ...d, squads: d.squads.filter((c) => c.name !== "Arsenal") };
    expect(buildWhatIfSession(s, missing, 1)).toBeNull();
  }, 60_000);
});
