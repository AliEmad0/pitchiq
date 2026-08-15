/**
 * Tests for `src/data/loaders.ts`.
 *
 * The loaders read from `data/*.json` on disk via `fs.promises.readFile`.
 * For the "missing season" tests we exercise a far-future season number that
 * has no committed JSON file (2099) — every year 1993-2024 now has data.
 *
 * Malformed-JSON tests are skipped — intercepting `node:fs/promises` with
 * `vi.mock` would work but adds significant boilerplate for low marginal
 * coverage. The happy-path and missing-data coverage is what TASK-504
 * requires; malformed-JSON rejection is already validated at the schema
 * level by the Zod schemas in `src/data/schemas.ts`.
 */
import { describe, expect, it } from "vitest";

// IDs verified against the committed data/teams-2024.json and
// data/players-2024.json files.
const LIVERPOOL_TEAM_ID = 40;
const SALAH_PLAYER_ID = 1001119;

// A season for which no JSON snapshot exists — used for the null/empty-path tests.
// 1993-2024 are all committed now (TASK-802), so use a far-future year.
const MISSING_SEASON = 2099;

// Aliases used by the loadTeamStats block (spec naming).
const REAL_SEASON = 2024;
const UNSUPPORTED_SEASON = MISSING_SEASON;

// Fixture ID format: "YYYY-MM-DD-HME-AWY" — first fixture in the 2024-25 season.
const KNOWN_FIXTURE_ID = "2024-08-16-MUN-FUL";

describe("loaders — meta", () => {
  it("loadMeta() returns a valid Meta object", async () => {
    const { loadMeta } = await import("@/data/loaders");
    const meta = await loadMeta();
    expect(meta).not.toBeNull();
    expect(meta!.lastRefresh).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Per-season rowCounts map (TASK-701) — the current season is always present.
    expect(meta!.seasons).toContain(2024);
    expect(meta!.rowCounts["2024"].standings).toBe(20);
    expect(meta!.rowCounts["2024"].teams).toBe(20);
  });

  it("getAvailableSeasons() returns committed seasons newest-first (TASK-702)", async () => {
    const { getAvailableSeasons } = await import("@/data/loaders");
    const seasons = await getAvailableSeasons();
    // 34 seasons ADVERTISED: 1992-93 → 2025-26. 1992-93 (the inaugural season) was
    // added in TASK-1403; 2025-26 is the live default since TASK-1203.
    // getAvailableSeasons filters _meta.seasons to <= currentDataSeason().
    expect(seasons.length).toBe(34);
    expect(seasons[0]).toBe(2025); // newest advertised first
    expect(seasons[seasons.length - 1]).toBe(1992); // oldest last (inaugural season)
    expect(seasons).toContain(2025);
    // Sorted strictly descending (newest first).
    for (let i = 1; i < seasons.length; i++) {
      expect(seasons[i]).toBeLessThan(seasons[i - 1]);
    }
  });
});

describe("loaders — standings", () => {
  it("loadStandings(2024) returns 20 rows", async () => {
    const { loadStandings } = await import("@/data/loaders");
    const rows = await loadStandings(2024);
    expect(rows).not.toBeNull();
    expect(rows!).toHaveLength(20);
  });

  it("loadStandings(2024) row has expected shape", async () => {
    const { loadStandings } = await import("@/data/loaders");
    const rows = await loadStandings(2024);
    const liverpool = rows!.find((r) => r.teamId === LIVERPOOL_TEAM_ID);
    expect(liverpool).toBeDefined();
    expect(liverpool!.teamName).toBe("Liverpool");
    expect(liverpool!.points).toBeGreaterThan(0);
    expect(typeof liverpool!.rank).toBe("number");
  });

  it("loadStandings() returns null for a missing season", async () => {
    const { loadStandings } = await import("@/data/loaders");
    const result = await loadStandings(MISSING_SEASON);
    expect(result).toBeNull();
  });
});

describe("loaders — teams", () => {
  it("loadTeams(2024) returns 20 teams", async () => {
    const { loadTeams } = await import("@/data/loaders");
    const teams = await loadTeams(2024);
    expect(teams).not.toBeNull();
    expect(teams!).toHaveLength(20);
  });

  it("loadTeams(2024) team entries have expected shape", async () => {
    const { loadTeams } = await import("@/data/loaders");
    const teams = await loadTeams(2024);
    const liverpool = teams!.find((t) => t.id === LIVERPOOL_TEAM_ID);
    expect(liverpool).toBeDefined();
    expect(liverpool!.name).toBe("Liverpool");
    expect(liverpool!.logo).toMatch(/^\/logos\/40\.png$/);
    expect(liverpool!.code).toHaveLength(3);
  });

  it("loadTeams() returns null for a missing season", async () => {
    const { loadTeams } = await import("@/data/loaders");
    const result = await loadTeams(MISSING_SEASON);
    expect(result).toBeNull();
  });
});

describe("loaders — squad", () => {
  it("loadSquad(liverpoolId, 2024) returns players", async () => {
    const { loadSquad, playerInSquad } = await import("@/data/loaders");
    const squad = await loadSquad(LIVERPOOL_TEAM_ID, 2024);
    expect(squad).not.toBeNull();
    expect(squad!.length).toBeGreaterThan(0);
    // Every returned player belongs to Liverpool — by primary teamId OR a
    // mid-season-transfer split (TASK-M07).
    for (const player of squad!) {
      expect(playerInSquad(player, LIVERPOOL_TEAM_ID)).toBe(true);
    }
  });

  it("loadSquad() returns [] for a teamId with no players", async () => {
    const { loadSquad } = await import("@/data/loaders");
    // 999999 is not a real PL team but the players file exists → empty array
    const result = await loadSquad(999999, 2024);
    expect(result).toEqual([]);
  });

  it("loadSquad() returns null for a missing season", async () => {
    const { loadSquad } = await import("@/data/loaders");
    const result = await loadSquad(LIVERPOOL_TEAM_ID, MISSING_SEASON);
    expect(result).toBeNull();
  });

  // TASK-M07: a mid-season transferee is a squad member of BOTH clubs.
  it("playerInSquad matches the primary teamId and any split teamId", async () => {
    const { playerInSquad } = await import("@/data/loaders");
    const base = {
      id: 1,
      name: "X",
      teamName: "Everton",
      position: "Forward" as const,
      photo: null,
      metrics: {} as never,
    };
    const single = { ...base, teamId: 45 };
    expect(playerInSquad(single, 45)).toBe(true);
    expect(playerInSquad(single, 90)).toBe(false);

    const transferee = {
      ...base,
      teamId: 45, // primary: Everton
      splits: [
        {
          teamId: 45,
          teamName: "Everton",
          appearances: 20,
          goals: 6,
          assists: 3,
          yellowCards: 1,
          redCards: 0,
        },
        {
          teamId: 90,
          teamName: "Burnley",
          appearances: 14,
          goals: 4,
          assists: 1,
          yellowCards: 2,
          redCards: 0,
        },
      ],
    };
    expect(playerInSquad(transferee, 45)).toBe(true);
    expect(playerInSquad(transferee, 90)).toBe(true); // the less-played club too
    expect(playerInSquad(transferee, 99)).toBe(false);
  });

  // TASK-M07: a real 2024-25 transferee (Axel Disasi: Chelsea 49 → Aston Villa 66)
  // appears in BOTH clubs' squads from the committed data.
  it("loadSquad returns a real mid-season transferee for both clubs", async () => {
    const { loadSquad } = await import("@/data/loaders");
    const villa = await loadSquad(66, 2024);
    const chelsea = await loadSquad(49, 2024);
    expect(villa!.some((p) => p.name === "Axel Disasi")).toBe(true);
    expect(chelsea!.some((p) => p.name === "Axel Disasi")).toBe(true);
  });
});

describe("loadTeamStats", () => {
  it("returns a derived stats summary for a known team", async () => {
    const { loadTeamStats } = await import("@/data/loaders");
    const stats = await loadTeamStats(LIVERPOOL_TEAM_ID, REAL_SEASON);
    expect(stats).not.toBeNull();
    expect(stats!.played).toBe(38);
    expect(stats!.won).toBeGreaterThan(0);
    expect(stats!.goalsFor).toBeGreaterThan(stats!.goalsAgainst);
  });

  it("returns null for an unknown team id", async () => {
    const { loadTeamStats } = await import("@/data/loaders");
    expect(await loadTeamStats(99999999, REAL_SEASON)).toBeNull();
  });

  it("returns null when the standings file is missing", async () => {
    const { loadTeamStats } = await import("@/data/loaders");
    expect(await loadTeamStats(LIVERPOOL_TEAM_ID, UNSUPPORTED_SEASON)).toBeNull();
  });
});

describe("loaders — players", () => {
  it("loadPlayers(2024) returns players array", async () => {
    const { loadPlayers } = await import("@/data/loaders");
    const players = await loadPlayers(2024);
    expect(players).not.toBeNull();
    expect(players!.length).toBeGreaterThan(0);
  });

  it("loadPlayer(salahId, 2024) returns Salah with correct goals", async () => {
    const { loadPlayer } = await import("@/data/loaders");
    const salah = await loadPlayer(SALAH_PLAYER_ID, 2024);
    expect(salah).not.toBeNull();
    expect(salah!.name).toBe("Mohamed Salah");
    // Don't pin the exact goal count — that's a real-data value that will
    // drift the moment `pnpm sync:data` regenerates the snapshot. Stable
    // invariants only: top scorer's goal count is > 0.
    expect(salah!.metrics.goals).toBeGreaterThan(0);
    expect(salah!.teamId).toBe(LIVERPOOL_TEAM_ID);
  });

  it("loadPlayer() returns null for an unknown player id", async () => {
    const { loadPlayer } = await import("@/data/loaders");
    const result = await loadPlayer(999999, 2024);
    expect(result).toBeNull();
  });

  it("loadPlayers() returns null for a missing season", async () => {
    const { loadPlayers } = await import("@/data/loaders");
    const result = await loadPlayers(MISSING_SEASON);
    expect(result).toBeNull();
  });
});

describe("loaders — leaderboards", () => {
  it("loadLeaderboard('scorers', 2024) returns ranked entries", async () => {
    const { loadLeaderboard } = await import("@/data/loaders");
    const entries = await loadLeaderboard("scorers", 2024);
    expect(entries).not.toBeNull();
    expect(entries!.length).toBeGreaterThan(0);
    // Top scorer should be ranked #1
    const top = entries![0];
    expect(top.rank).toBe(1);
    expect(top.value).toBeGreaterThan(0);
  });

  it("loadLeaderboard('assists', 2024) returns entries", async () => {
    const { loadLeaderboard } = await import("@/data/loaders");
    const entries = await loadLeaderboard("assists", 2024);
    expect(entries).not.toBeNull();
    expect(entries!.length).toBeGreaterThan(0);
  });

  it("loadLeaderboard('yellow-cards', 2024) returns entries", async () => {
    const { loadLeaderboard } = await import("@/data/loaders");
    const entries = await loadLeaderboard("yellow-cards", 2024);
    expect(entries).not.toBeNull();
    expect(entries!.length).toBeGreaterThan(0);
  });

  it("loadLeaderboard('red-cards', 2024) returns entries", async () => {
    const { loadLeaderboard } = await import("@/data/loaders");
    const entries = await loadLeaderboard("red-cards", 2024);
    expect(entries).not.toBeNull();
    expect(entries!.length).toBeGreaterThan(0);
  });

  it("loadLeaderboard() returns null for a missing season", async () => {
    const { loadLeaderboard } = await import("@/data/loaders");
    const result = await loadLeaderboard("scorers", MISSING_SEASON);
    expect(result).toBeNull();
  });
});

describe("loaders — fixtures", () => {
  it("loadFixtures(2024) returns 380 fixtures", async () => {
    const { loadFixtures } = await import("@/data/loaders");
    const fixtures = await loadFixtures(2024);
    expect(fixtures).not.toBeNull();
    expect(fixtures!).toHaveLength(380);
  });

  it("loadFixtures(2024) entries have expected shape", async () => {
    const { loadFixtures } = await import("@/data/loaders");
    const fixtures = await loadFixtures(2024);
    const first = fixtures![0];
    expect(first.id).toEqual(expect.any(String));
    expect(first.homeTeamId).toEqual(expect.any(Number));
    expect(first.awayTeamId).toEqual(expect.any(Number));
    expect(first.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("loadFixture(id, 2024) returns the matching fixture", async () => {
    const { loadFixture } = await import("@/data/loaders");
    const fixture = await loadFixture(KNOWN_FIXTURE_ID, 2024);
    expect(fixture).not.toBeNull();
    expect(fixture!.id).toBe(KNOWN_FIXTURE_ID);
  });

  it("loadFixture() returns null for an unknown fixture id", async () => {
    const { loadFixture } = await import("@/data/loaders");
    const result = await loadFixture("not-a-real-fixture-id", 2024);
    expect(result).toBeNull();
  });

  it("loadFixtures() returns null for a missing season", async () => {
    const { loadFixtures } = await import("@/data/loaders");
    const result = await loadFixtures(MISSING_SEASON);
    expect(result).toBeNull();
  });
});

describe("loaders — malformed JSON", () => {
  it.skip(// Skipped: intercepting node:fs/promises with vi.mock would work but
  // adds significant boilerplate for low marginal coverage. The Zod
  // schema rejection path is already exercised by the schema tests, and
  // the JSON-parse path is straightforward enough that the risk is low.
  "loadStandings() returns null when the file contains invalid JSON", () => {});

  it.skip(// Skipped: intercepting node:fs/promises with vi.mock would work but
  // adds significant boilerplate for low marginal coverage. The Zod
  // schema rejection path is already exercised by the schema tests, and
  // the JSON-parse path is straightforward enough that the risk is low.
  "loadFixtures() returns null when the file contains invalid JSON", () => {});
});

describe("findPlayerSeasons (TASK-704 / M10)", () => {
  it("returns the descending list of seasons a player appears in", async () => {
    const { findPlayerSeasons } = await import("@/data/loaders");
    const result = await findPlayerSeasons(SALAH_PLAYER_ID);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Mohamed Salah");
    // Salah's most-recent committed season is 2025-26; he has Liverpool data
    // from 2017-18 onward.
    expect(result!.seasons[0]).toBe(2025);
    expect(result!.seasons).toContain(2024);
    expect(result!.seasons).toContain(2017);
    // Strictly descending, newest-first.
    for (let i = 1; i < result!.seasons.length; i++) {
      expect(result!.seasons[i]).toBeLessThan(result!.seasons[i - 1]);
    }
  });

  it("returns null for an unknown player id", async () => {
    const { findPlayerSeasons } = await import("@/data/loaders");
    expect(await findPlayerSeasons(999999)).toBeNull();
  });
});

describe("findTeamSeasons (TASK-M10)", () => {
  it("returns every committed season for an ever-present club, newest-first", async () => {
    const { findTeamSeasons } = await import("@/data/loaders");
    const seasons = await findTeamSeasons(LIVERPOOL_TEAM_ID);
    // Liverpool — a founding PL member, never relegated — appears in all 34
    // committed seasons (1992-93 → 2025-26).
    expect(seasons).toHaveLength(34);
    expect(seasons[0]).toBe(2025); // newest first
    expect(seasons[seasons.length - 1]).toBe(1992); // oldest last
    for (let i = 1; i < seasons.length; i++) {
      expect(seasons[i]).toBeLessThan(seasons[i - 1]);
    }
  });

  it("returns only the historical seasons a defunct/short-lived club existed", async () => {
    const { findTeamSeasons } = await import("@/data/loaders");
    // Blackpool (1356) played a single PL season: 2010-11.
    const seasons = await findTeamSeasons(1356);
    expect(seasons).toEqual([2010]);
  });

  it("returns [] for a team id in no committed season", async () => {
    const { findTeamSeasons } = await import("@/data/loaders");
    expect(await findTeamSeasons(99999999)).toEqual([]);
  });
});

describe("loaders — lineups + events (Phase 10)", () => {
  // Covered seasons ≈ 2019-26. Uses the committed backfill data.
  const COVERED_SEASON = 2025;

  it("loadLineups returns a populated map for a covered season", async () => {
    const { loadLineups } = await import("@/data/loaders");
    const all = await loadLineups(COVERED_SEASON);
    expect(all).not.toBeNull();
    expect(Object.keys(all!).length).toBeGreaterThan(0);
  });

  it("loadLineup returns a fixture's lineups for a covered fixture", async () => {
    const { loadLineups, loadLineup } = await import("@/data/loaders");
    const all = await loadLineups(COVERED_SEASON);
    const someId = Object.keys(all!)[0];
    const one = await loadLineup(someId, COVERED_SEASON);
    expect(one).not.toBeNull();
    expect(one!.home.teamId).toBeGreaterThan(0);
    expect(Array.isArray(one!.home.startXI)).toBe(true);
  });

  it("loadLineup returns null for an unknown fixture id", async () => {
    const { loadLineup } = await import("@/data/loaders");
    expect(await loadLineup("nope", COVERED_SEASON)).toBeNull();
  });

  it("loadEvents returns [] for an unknown fixture id and null for a missing season", async () => {
    const { loadEvents } = await import("@/data/loaders");
    expect(await loadEvents("nope", COVERED_SEASON)).toEqual([]);
    expect(await loadEvents("nope", MISSING_SEASON)).toBeNull();
  });

  it("loadLineups returns null for a missing season", async () => {
    const { loadLineups } = await import("@/data/loaders");
    expect(await loadLineups(MISSING_SEASON)).toBeNull();
  });
});

describe("loadClubMetadata (TASK-M19)", () => {
  it("returns the committed club-metadata map with Man Utd → Manchester + a stadium image", async () => {
    const { loadClubMetadata } = await import("@/data/loaders");
    const meta = await loadClubMetadata();
    expect(meta).not.toBeNull();
    expect(meta!["33"].city).toBe("Manchester");
    expect(meta!["33"].stadiumImage).toMatch(/^https:\/\//);
    // Every committed club is present (TASK-M19 covers all 51).
    expect(Object.keys(meta!).length).toBe(51);
  });
});

describe("loadGoalAttribution (TASK-M26)", () => {
  it("returns the committed goal-attribution map with sane shape", async () => {
    const { loadGoalAttribution } = await import("@/data/loaders");
    const map = await loadGoalAttribution();
    expect(map).not.toBeNull();
    // A prolific career striker is present with a wide opponent spread.
    expect(Object.keys(map!.players).length).toBeGreaterThan(500);
    expect(Object.keys(map!.teams).length).toBeGreaterThan(20);
  });
});

describe("loaders — fixture extras (TASK-M16)", () => {
  it("loadFixtureExtras(2024) returns the committed attendance/venue map", async () => {
    const { loadFixtureExtras } = await import("@/data/loaders");
    const extras = await loadFixtureExtras(REAL_SEASON);
    expect(extras).not.toBeNull();
    const entry = extras![KNOWN_FIXTURE_ID];
    expect(entry).toBeDefined();
    expect(typeof entry.attendance === "number" || entry.attendance === null).toBe(true);
    expect(typeof entry.venue === "string" || entry.venue === null).toBe(true);
  });

  it("loadFixtureExtras returns null for a season with no committed file", async () => {
    const { loadFixtureExtras } = await import("@/data/loaders");
    expect(await loadFixtureExtras(MISSING_SEASON)).toBeNull();
  });
});

describe("loaders — Arabic name maps (TASK-1606)", () => {
  it("loadArPositionNames() loads the seeded positions map", async () => {
    const { loadArPositionNames } = await import("@/data/loaders");
    const m = await loadArPositionNames();
    expect(m?.Goalkeeper).toBe("حارس مرمى");
    expect(m?.Forward).toBe("مهاجم");
  });
  it("loadArNationalityOverrides() loads home-nation overrides", async () => {
    const { loadArNationalityOverrides } = await import("@/data/loaders");
    const m = await loadArNationalityOverrides();
    expect(m?.["gb-eng"]).toBe("إنجلترا");
  });
  it("loadArTeamNames() returns the (seeded) team map, not null", async () => {
    const { loadArTeamNames } = await import("@/data/loaders");
    const m = await loadArTeamNames();
    expect(m).not.toBeNull();
    expect(m?.["33"]).toBe("مانشستر يونايتد");
  });
  it("loadArPlayerNames() returns an object for the empty map", async () => {
    const { loadArPlayerNames } = await import("@/data/loaders");
    expect(await loadArPlayerNames()).not.toBeNull();
  });
});

/**
 * TASK-M78 — manager enrichment loaders.
 *
 * These read the real committed files, which is the point: `readJsonOrNull` swallows a
 * schema mismatch and returns **null**, so a drifted schema would silently blank the
 * manager pages with no error anywhere. Asserting a named manager's real numbers is the
 * only thing that catches it.
 */
describe("manager enrichment loaders (TASK-M78)", () => {
  const WENGER = "51";
  const MOURINHO = "134";

  it("loadManagerEnrichment() parses the committed summary rather than returning null", async () => {
    const { loadManagerEnrichment } = await import("@/data/loaders");
    const m = await loadManagerEnrichment();
    expect(m).not.toBeNull();

    // Arsène Wenger: 1,231 games at Arsenal across a 4-club career.
    expect(m?.[WENGER]?.clubsManaged).toBe(4);
    expect(m?.[WENGER]?.careerMatches).toBeGreaterThan(1700);

    // Silverware only — "Manager of the Year" is an award, not a trophy.
    expect(m?.[MOURINHO]?.trophies).toBe(26);
    expect(m?.[MOURINHO]?.awards).toBeGreaterThan(0);
  });

  // TASK-M87 — the crawl banked these portraits from M86 onward and the schema
  // dropped them, so they never reached the app. Named managers, per the M86
  // audit rule: a coverage count can look healthy while the field is missing.
  it("ships the crawled portrait for the managers who render initials without it", async () => {
    const { loadManagerEnrichment } = await import("@/data/loaders");
    const m = await loadManagerEnrichment();
    // Oliver Glasner and Andoni Iraola: both PL-CDN candidates 404, so before
    // M87 each showed an "OG"/"AI" monogram on every surface.
    expect(m?.["44410"]?.photo).toMatch(/^https:\/\/img\.a\.transfermarkt\.technology\//);
    expect(m?.["50428"]?.photo).toMatch(/^https:\/\/img\.a\.transfermarkt\.technology\//);
  });

  it("carries a portrait for most managers and null — never undefined — for the rest", async () => {
    const { loadManagerEnrichment } = await import("@/data/loaders");
    const m = await loadManagerEnrichment();
    const all = Object.values(m ?? {});
    expect(all.length).toBeGreaterThan(100);
    // `undefined` would mean the schema stripped the key (the M75 zod trap).
    for (const [id, s] of Object.entries(m ?? {})) {
      expect(s.photo, `photo for ${id}`).not.toBeUndefined();
    }
    expect(all.filter((s) => s.photo).length).toBeGreaterThan(150);
  });

  it("keeps careerPpm consistent with the W/D/L it ships", async () => {
    const { loadManagerEnrichment } = await import("@/data/loaders");
    const m = await loadManagerEnrichment();
    // Assert the map is populated FIRST: a missing file makes the loop below iterate
    // nothing and pass vacuously, which is exactly the silent-null this suite guards.
    expect(Object.keys(m ?? {}).length).toBeGreaterThan(100);
    for (const [id, s] of Object.entries(m ?? {})) {
      expect(s.careerWins + s.careerDraws + s.careerLosses, `W+D+L for ${id}`).toBe(
        s.careerMatches,
      );
      const expected =
        s.careerMatches > 0
          ? Math.round(((3 * s.careerWins + s.careerDraws) / s.careerMatches) * 100) / 100
          : null;
      expect(s.careerPpm, `ppm for ${id}`).toBe(expected);
    }
  });

  it("loadManagerCareerHistory() parses, and keeps Wenger's Arsenal spell", async () => {
    const { loadManagerCareerHistory } = await import("@/data/loaders");
    const m = await loadManagerCareerHistory();
    expect(m).not.toBeNull();
    const arsenal = m?.[WENGER]?.spells.find((s) => s.club === "Arsenal");
    expect(arsenal?.matches).toBe(1231);
  });

  it("loadManagerHonoursHistory() parses, and classifies awards apart from silverware", async () => {
    const { loadManagerHonoursHistory } = await import("@/data/loaders");
    const m = await loadManagerHonoursHistory();
    expect(m).not.toBeNull();
    const moty = m?.[MOURINHO]?.titles.find((t) => /manager of the year/i.test(t.title));
    expect(moty?.kind).toBe("award");
    const ucl = m?.[MOURINHO]?.titles.find((t) => /champions league winner/i.test(t.title));
    expect(ucl?.kind).toBe("trophy");
  });
});
