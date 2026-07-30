import "server-only";

import { getEntityNames } from "@/features/i18n/entity-names";
import { loadManagers, loadManagerBios } from "@/data/loaders";
import { seedAge } from "@/utils/age";

/**
 * A team's manager(s) for a season (TASK-M48), resolved from `managers.json`
 * (which managers + match counts) joined to `manager-bio.json`
 * (DOB + optional DOD + nationality + photo, keyed by the manager's PL id).
 * `photo` is the bio override photo when present (TASK-M50 — managers without an
 * official PL headshot, e.g. Carrick/Fletcher, supply a portrait URL),
 * else the PL id, which `<PlayerImage>` resolves to the official PL-CDN headshot.
 * `age` is the server seed (`<PlayerAge>` refines a living manager's value).
 */
export type ManagerProfile = {
  id: string;
  name: string;
  photo: string;
  birthDate: string | null;
  dateOfDeath: string | null;
  age: number | null;
  matches: number;
};

export async function getTeamManagers(
  season: number,
  teamId: number,
  // TASK-M71c: explicit locale for Route Handlers (see teams/api.ts getTeam).
  locale?: string,
): Promise<ManagerProfile[]> {
  const [managers, bios, names] = await Promise.all([
    loadManagers(),
    loadManagerBios(),
    getEntityNames(locale),
  ]);
  const list = managers?.[String(season)]?.[String(teamId)] ?? [];
  return list.map((m) => {
    const bio = bios?.[m.id];
    return {
      id: m.id,
      // TASK-1606 follow-up: localize the manager name on `/ar` (was Latin —
      // the team-page manager section never threaded the resolver).
      name: names.manager(m.id, m.name),
      photo: bio?.photo ?? m.id, // override photo wins, else PL id → PL-CDN
      birthDate: bio?.birthDate ?? null,
      dateOfDeath: bio?.dateOfDeath ?? null,
      age: seedAge(bio?.birthDate ?? null, null, bio?.dateOfDeath ?? null),
      matches: m.matches,
    };
  });
}
