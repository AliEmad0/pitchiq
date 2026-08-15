import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadManagers, loadManagerBios, loadManagerEnrichment } from "@/data/loaders";
import { getEntityNames, makeEntityNames } from "@/features/i18n/entity-names";
import { getTeamManagers } from "@/features/teams/managers.api";

vi.mock("@/data/loaders", () => ({
  loadManagers: vi.fn(),
  loadManagerBios: vi.fn(),
  loadManagerEnrichment: vi.fn(async () => null),
}));

// Resolver defaults to identity (Latin); the /ar test overrides it once.
vi.mock("@/features/i18n/entity-names", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/i18n/entity-names")>();
  return { ...actual, getEntityNames: vi.fn(async () => actual.IDENTITY_NAMES) };
});

// Manager entry with the TASK-M49 result fields (getTeamManagers ignores them).
const M = (id: string, name: string, matches: number) => ({
  id,
  name,
  matches,
  win: 0,
  draw: 0,
  loss: 0,
  gf: 0,
  ga: 0,
});

describe("getTeamManagers", () => {
  beforeEach(() => {
    vi.mocked(loadManagers).mockReset();
    vi.mocked(loadManagerBios).mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("joins managers to their bio + computes a seed age (most matches first)", async () => {
    vi.mocked(loadManagers).mockResolvedValue({
      "2022": {
        "49": [M("51070", "Graham Potter", 22), M("99", "Frank Lampard", 9)],
      },
    });
    vi.mocked(loadManagerBios).mockResolvedValue({
      "51070": { birthDate: "1975-05-20", dateOfDeath: null },
      // id 99 has no bio entry → nulls.
    });

    const out = await getTeamManagers(2022, 49);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      id: "51070",
      name: "Graham Potter",
      photo: "51070",
      birthDate: "1975-05-20",
      matches: 22,
    });
    expect(out[0].age).toBeGreaterThan(40); // seeded from DOB
    expect(out[1]).toMatchObject({ id: "99", birthDate: null, dateOfDeath: null, age: null });
  });

  it("freezes a deceased manager's age at the date of death", async () => {
    vi.mocked(loadManagers).mockResolvedValue({
      "2024": { "46": [M("44439", "Craig Shakespeare", 1)] },
    });
    vi.mocked(loadManagerBios).mockResolvedValue({
      "44439": { birthDate: "1963-10-26", dateOfDeath: "2024-08-01" },
    });

    const out = await getTeamManagers(2024, 46);
    expect(out[0].dateOfDeath).toBe("2024-08-01");
    expect(out[0].age).toBe(60); // 1963-10-26 → 2024-08-01
  });

  it("prefers the bio override photo over the PL id (TASK-M50 fix)", async () => {
    vi.mocked(loadManagers).mockResolvedValue({
      "2025": { "33": [M("56407", "Michael Carrick", 1)] },
    });
    vi.mocked(loadManagerBios).mockResolvedValue({
      "56407": { birthDate: null, dateOfDeath: null, photo: "https://img/carrick.jpg" },
    });
    const out = await getTeamManagers(2025, 33);
    expect(out[0].photo).toBe("https://img/carrick.jpg");
  });

  it("falls back to the PL id when the bio has no photo", async () => {
    vi.mocked(loadManagers).mockResolvedValue({
      "2025": { "33": [M("58", "Alex Ferguson", 1)] },
    });
    vi.mocked(loadManagerBios).mockResolvedValue({
      "58": { birthDate: "1941-12-31", dateOfDeath: null },
    });
    const out = await getTeamManagers(2025, 33);
    expect(out[0].photo).toBe("58");
  });

  it("returns [] when the season/team has no manager data (legacy)", async () => {
    vi.mocked(loadManagers).mockResolvedValue(null);
    vi.mocked(loadManagerBios).mockResolvedValue(null);
    expect(await getTeamManagers(1998, 33)).toEqual([]);
  });

  // TASK-1606 follow-up: the team-page manager section was Latin.
  it("localizes the manager name on /ar", async () => {
    vi.mocked(loadManagers).mockResolvedValue({
      "2022": { "49": [M("51070", "Graham Potter", 22)] },
    });
    vi.mocked(loadManagerBios).mockResolvedValue({});
    vi.mocked(getEntityNames).mockResolvedValueOnce(
      makeEntityNames(
        {
          managers: { "51070": "غراهام بوتر" },
          teams: {},
          players: {},
          venues: {},
          cities: {},
          referees: {},
          positions: {},
          nationalities: {},
        },
        "ar",
      ),
    );

    const out = await getTeamManagers(2022, 49);
    expect(out[0].name).toBe("غراهام بوتر");
  });

  // TASK-M87 — the team page shows the same manager avatar as the index, so a
  // portrait published for one surface must reach this one too.
  describe("crawled portrait fallback (TASK-M87)", () => {
    beforeEach(() => {
      vi.mocked(loadManagers).mockResolvedValue({
        "2024": { "31": [M("44410", "Oliver Glasner", 38)] },
      });
      vi.mocked(loadManagerBios).mockResolvedValue({});
    });

    it("exposes the enrichment portrait as photoFallback, leaving photo as the id", async () => {
      vi.mocked(loadManagerEnrichment).mockResolvedValue({
        "44410": { photo: "https://img.a.transfermarkt.technology/p/22891.jpg" },
      } as never);
      const out = await getTeamManagers(2024, 31);
      expect(out[0].photo).toBe("44410");
      expect(out[0].photoFallback).toBe("https://img.a.transfermarkt.technology/p/22891.jpg");
    });

    it("leaves photoFallback null when the crawl banked nothing for him", async () => {
      vi.mocked(loadManagerEnrichment).mockResolvedValue({ "44410": { photo: null } } as never);
      const out = await getTeamManagers(2024, 31);
      expect(out[0].photoFallback).toBeNull();
    });
  });
});
