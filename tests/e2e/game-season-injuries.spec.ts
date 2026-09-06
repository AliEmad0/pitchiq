import { test, expect } from "./_helpers/test";
import { seasonSave } from "./_helpers/season-save";
import { restoreClassic } from "../../src/features/game/view/classic-session";
import { advanceClassic } from "../../src/features/game/view/classic-run";
import type { SavedClassic } from "../../src/features/game/storage/classic-slot";
import type { ClassicData } from "../../src/features/game/domain/classic-data";
import type { SavedRun } from "../../src/features/game/storage/season-slot";
import type { PoolCard } from "../../src/features/game/domain/chaos-draft";
import { classicLineup } from "../../src/features/game/domain/classic-lineup";
import { formationByName, formationKey } from "../../src/features/game/domain/formation";
import { reservePlayers } from "../../src/features/game/domain/season-availability";

test.describe.configure({ retries: 0 });

test("Classic sim injuries survive reload and recover by coach fixtures", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/game/classic", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Start season", exact: true }).click({ timeout: 60_000 });
  const initial = await seasonSave<SavedClassic>(page, "classic-current");
  const data: ClassicData = await (
    await page.request.get(`/api/game/classic/${initial.season}`)
  ).json();
  const teams = restoreClassic(data, initial).teams;
  let expected: ReturnType<typeof advanceClassic> | undefined;
  for (let seed = 0; seed < 100; seed++) {
    const candidate = advanceClassic(data.schedule, teams, {
      seed,
      coach: data.clubIds.indexOf(initial.clubId),
      results: [],
    });
    if (candidate.injuries?.length) {
      initial.seed = seed;
      expected = candidate;
      break;
    }
  }
  expect(expected?.injuries?.length).toBeGreaterThan(0);
  await seasonSave(page, "classic-current", initial);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Sim fixture", exact: true }).click();
  await expect(page.getByText("1 of 38 fixtures", { exact: false })).toBeVisible();
  const injured = await seasonSave<SavedClassic>(page, "classic-current");
  expect(injured.injuries).toEqual(expected!.injuries);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("1 of 38 fixtures", { exact: false })).toBeVisible();
  expect(await seasonSave(page, "classic-current")).toEqual(injured);
  await page.locator("summary").filter({ hasText: "Your XI" }).click();
  const tracked = injured.injuries![0];
  await expect(
    page.getByText(
      `${data.squads.find((c) => c.teamId === initial.clubId)!.pool.find((p) => p.cardId === tracked.cardId)!.name}: unavailable for ${tracked.remaining} more fixtures.`,
      { exact: true },
    ),
  ).toBeVisible();
  const unavailable = restoreClassic(data, injured).unavailable;
  await page
    .getByRole("button", {
      name: unavailable ? "Forfeit fixture (0–3)" : "Sim fixture",
      exact: true,
    })
    .click();
  await expect(page.getByText("2 of 38 fixtures", { exact: false })).toBeVisible();
  const next = await seasonSave<SavedClassic>(page, "classic-current");
  expect(next.results.slice(0, injured.results.length)).toEqual(injured.results);
  expect(next.injuries?.find((i) => i.cardId === tracked.cardId)?.remaining ?? 0).toBe(
    tracked.remaining - 1,
  );
});

test("Legacy rotation and unavailable roster survive reload and an explicit forfeit", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/game/classic", { waitUntil: "domcontentloaded" }); // Initializes the DB without a Legacy draft.
  await page.getByRole("button", { name: "Start season", exact: true }).click({ timeout: 60_000 });
  // Fetch real rival payloads once, then reuse them across reloads (CDN behavior).
  const rivals: Record<string, unknown> = {};
  for (const club of [40, 42, 33, 50]) {
    const res = await page.request.get(`/api/game/rivals/${club}`);
    expect(res.ok()).toBe(true);
    const payload = await res.json();
    expect(payload.cards.length).toBeGreaterThan(0);
    rivals[String(club)] = payload;
  }
  await page.route("**/api/game/rivals/*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    if (rivals[id]) await route.fulfill({ json: rivals[id] });
    else await route.continue();
  });
  const { cards } = rivals["40"] as { cards: PoolCard[] };
  const formation = formationByName("4-4-2 Flat");
  const xi = classicLineup(cards, formation)!;
  expect(xi).not.toBeNull();
  const roster = [...xi, ...reservePlayers(cards, xi)];
  const saved: SavedRun = {
    seed: 4242,
    clubs: 4,
    coach: 0,
    leagueIds: [40, 42, 33, 50],
    cardIds: xi.map((p) => p.cardId),
    formationKey: formationKey(formation),
    rosterIds: roster.map((p) => p.cardId),
    lineupIds: xi.map((p) => p.cardId),
    results: [],
  };
  await seasonSave(page, "current", saved);
  await page.goto("/game/legacy/40?format=season", { waitUntil: "domcontentloaded" });
  const play = page.getByRole("button", { name: "Play fixture", exact: true });
  await expect(page.getByTestId("season-hub")).toBeVisible({ timeout: 120_000 });
  expect((await page.getByRole("alert").allTextContents()).filter(Boolean)).toEqual([]);
  await expect(play).toBeEnabled();
  const keeper = page.getByRole("combobox", { name: "Position 1", exact: true });
  const original = await keeper.inputValue();
  const replacement = await keeper
    .locator("option")
    .evaluateAll(
      (options, value) =>
        options.map((o) => (o as HTMLOptionElement).value).find((v) => v !== value),
      original,
    );
  expect(replacement).toBeTruthy();
  await keeper.selectOption(replacement!);
  await expect(play).toBeEnabled();
  const rotated = await seasonSave<SavedRun>(page, "current");
  expect(rotated.rosterIds).toEqual(saved.rosterIds);
  expect(rotated.lineupIds![0]).toBe(replacement);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(play).toBeEnabled({ timeout: 120_000 });
  await expect(keeper).toHaveValue(replacement!);
  // Every keeper unavailable: no ineligible stand-in and no silent recovery on reload.
  rotated.injuries = roster
    .filter((p) => p.role === "GK")
    .map((p) => ({ cardId: p.cardId, remaining: 1 }));
  await seasonSave(page, "current", rotated);
  await page.reload({ waitUntil: "domcontentloaded" });
  const forfeit = page.getByRole("button", { name: "Forfeit fixture (0–3)", exact: true });
  await expect(forfeit).toBeEnabled({ timeout: 120_000 });
  await expect(play).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("legacy-injuries-mobile.png"),
    fullPage: true,
  });
  await forfeit.click();
  await expect(page.getByTestId("season-week")).toContainText("Matchweek 1 of 6");
  await expect(play).toBeEnabled();
  const recovered = await seasonSave<SavedRun>(page, "current");
  expect(recovered.injuries).toEqual([]);
  expect(recovered.rosterIds).toEqual(rotated.rosterIds);
  expect(recovered.results.find((r) => r.home === 0)).toMatchObject({ homeGoals: 0, awayGoals: 3 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(play).toBeEnabled({ timeout: 120_000 });
  expect((await seasonSave<SavedRun>(page, "current")).results).toEqual(recovered.results);
});
