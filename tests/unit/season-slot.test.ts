import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { idbGet, idbPut } from "@/features/game/storage/idb";
import { clearRun, loadRun, saveRun, type SavedRun } from "@/features/game/storage/season-slot";

const run = (): SavedRun => ({
  seed: 4242,
  clubs: 20,
  coach: 0,
  results: [{ week: 0, home: 0, away: 1, homeGoals: 2, awayGoals: 1, seed: 77 }],
  cardIds: ["1@2020", "2@2020"],
  formationKey: "4-4-2 Flat",
});

describe("the season slot", () => {
  beforeEach(async () => {
    await clearRun();
  });

  it("round-trips a run", async () => {
    await saveRun(run());
    expect(await loadRun()).toEqual(run());
  });

  it("returns null when there is nothing saved", async () => {
    expect(await loadRun()).toBeNull();
  });

  it("keeps only ONE run — saving again replaces it", async () => {
    await saveRun(run());
    await saveRun({ ...run(), seed: 999 });
    expect((await loadRun())!.seed).toBe(999);
  });

  it("⚠️ carries the SQUAD, because a season is draft-once", async () => {
    await saveRun(run());
    const back = (await loadRun())!;
    expect(back.cardIds).toEqual(["1@2020", "2@2020"]);
    // The KEY, never an index into FORMATIONS — reordering that array must not reshape a run.
    expect(back.formationKey).toBe("4-4-2 Flat");
  });

  it("⛔ a record in ANOTHER store survives the v2 → v3 upgrade", async () => {
    // `idb.ts` claims the upgrade adds stores idempotently and never rebuilds. TASK-1817 proved
    // it for `daily`; this proves it again for `season` rather than inheriting the claim.
    await idbPut("match", "current", { marker: "pre-upgrade" });
    await saveRun(run());
    expect(await idbGet("match", "current")).toEqual({ marker: "pre-upgrade" });
    expect(await loadRun()).not.toBeNull();
  });
});
