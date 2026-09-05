import { expect, it } from "vitest";
import { classicLineup } from "@/features/game/domain/classic-lineup";
import { canPlay } from "@/features/game/domain/eligibility";
import { makeTeam } from "./_helpers/match-setup";

it("finds a legal assignment when a versatile player would steal the only fullback", () => {
  const team = makeTeam();
  // CB can cover LB; the nominal LB is only a CB. Greedy slot order must reassign.
  const pool = team.players.map((p, i) =>
    i === 1 ? { ...p, role: "CB" as const } : i === 2 ? { ...p, altRoles: ["LB" as const] } : p,
  );
  const xi = classicLineup(pool, team.formation)!;
  expect(xi).toHaveLength(11);
  expect(new Set(xi.map((p) => p.playerId)).size).toBe(11);
  expect(xi.every((p, i) => canPlay(p, team.formation.slots[i].role))).toBe(true);
});
it("rejects a missing keeper and cannot use a duplicate person twice", () => {
  const team = makeTeam();
  expect(classicLineup(team.players.slice(1), team.formation)).toBeNull();
  const pool = team.players.map((p, i) => (i === 3 ? team.players[2] : p));
  expect(classicLineup(pool, team.formation)).toBeNull();
});
it("is deterministic under pool order changes and does not mutate the pool", () => {
  const team = makeTeam();
  const before = structuredClone(team.players);
  expect(classicLineup(team.players, team.formation)).toEqual(
    classicLineup(team.players.slice().reverse(), team.formation),
  );
  expect(team.players).toEqual(before);
});
