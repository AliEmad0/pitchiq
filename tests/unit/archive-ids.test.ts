import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isArchivedSeason } from "@/data/archive";
import { getAvailableSeasons, loadFixtures } from "@/data/loaders";
import archiveIds from "@/generated/archive-ids.json";
import { archiveShellFor, FIXTURE_ARCHIVE_SHELL } from "@/utils/archive-route";
import { currentDataSeason } from "@/utils/season";

/**
 * TASK-M96 — the static-data archive's routing contract.
 *
 * The middleware decides from a COMMITTED id list (the edge cannot read `data/`), so the list
 * must equal what the loaders say, or an archived match falls through to the route and 404s.
 */
describe("the archive id list", () => {
  it("⛔ matches the committed data exactly — run `node scripts/gen-archive-ids.mjs` if not", async () => {
    const expected: string[] = [];
    for (const season of await getAvailableSeasons()) {
      if (!isArchivedSeason(season)) continue;
      for (const f of (await loadFixtures(season)) ?? []) expected.push(f.id);
    }
    expect(archiveIds.currentSeason).toBe(currentDataSeason());
    expect(archiveIds.fixtures.split(",")).toEqual(expected.sort());
  });

  it("⭐ partitions EVERY match: archived or prerendered, never both, never neither", async () => {
    const archived = new Set(archiveIds.fixtures.split(","));
    let prerendered = 0;
    let total = 0;
    for (const season of await getAvailableSeasons()) {
      for (const f of (await loadFixtures(season)) ?? []) {
        total++;
        if (isArchivedSeason(season)) expect(archived.has(f.id), f.id).toBe(true);
        else {
          prerendered++;
          expect(archived.has(f.id), f.id).toBe(false);
        }
      }
    }
    expect(archived.size + prerendered).toBe(total);
    expect(prerendered).toBeGreaterThan(0);
    expect(archived.size).toBeGreaterThan(10_000);
  });
});

describe("archiveShellFor (middleware rewrite)", () => {
  const someArchived = archiveIds.fixtures.split(",")[0]!;

  it("rewrites an archived match to the shell, with or without a trailing slash", () => {
    expect(archiveShellFor(`/fixtures/${someArchived}`)).toBe(FIXTURE_ARCHIVE_SHELL);
    expect(archiveShellFor(`/fixtures/${someArchived}/`)).toBe(FIXTURE_ARCHIVE_SHELL);
  });

  it("leaves a current-season match to its prerendered page", async () => {
    const current = (await loadFixtures(currentDataSeason()))![0]!.id;
    expect(archiveShellFor(`/fixtures/${current}`)).toBeNull();
  });

  it("⛔ leaves a well-formed but UNKNOWN id alone, so the route still answers a real 404", () => {
    // The exact probe tests/e2e/not-found.spec.ts uses (TASK-M72 soft-404 rule).
    expect(archiveShellFor("/fixtures/2003-01-01-XXX-YYY")).toBeNull();
  });

  it("ignores everything that is not a match detail URL", () => {
    expect(archiveShellFor("/fixtures")).toBeNull();
    expect(archiveShellFor(`/fixtures/${someArchived}/extra`)).toBeNull();
    expect(archiveShellFor(`/players/${someArchived}`)).toBeNull();
  });
});

describe("the archive surfaces stay static", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it.each([
    "src/app/api/archive/fixtures/[id]/route.ts",
    "src/app/[locale]/archive/fixture/page.tsx",
  ])("⛔ %s is force-static and never revalidates", (rel) => {
    const src = read(rel);
    expect(src).toMatch(/export const dynamic = "force-static"/);
    expect(src).toMatch(/export const revalidate = false/);
  });

  it("⛔ the archive JSON route is a CLOSED set — a visit can never run a function", () => {
    const src = read("src/app/api/archive/fixtures/[id]/route.ts");
    expect(src).toMatch(/export const dynamicParams = false/);
    expect(src).toMatch(/export async function generateStaticParams/);
  });
});
