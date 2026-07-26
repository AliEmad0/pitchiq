/**
 * TASK: Fluid Active-CPU fix — in-process memoization of the data-file loaders.
 *
 * `data/*.json` is immutable within a deployment (the sync cron commits new
 * data → a fresh deploy), so a parsed+validated file can be reused for the
 * lifetime of a warm Fluid instance. This is the hot path: `findPlayerSeasons`
 * re-reads all 34 season files on every player-page render. Caching turns that
 * into one parse per file per instance.
 *
 * Gated to production so `next dev` and the test suite keep reading fresh.
 * We assert the observable effect — the same parsed instance is returned when
 * cached (one parse), a fresh instance otherwise.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

describe("loaders — in-process data-file cache (Fluid CPU fix)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the same parsed instance across repeated loads in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const loaders = await import("@/data/loaders");
    loaders.__resetDataFileCache();

    const a = await loaders.loadPlayers(2024);
    const b = await loaders.loadPlayers(2024);

    expect(a).not.toBeNull();
    expect(a).toBe(b); // identical reference → the file was parsed exactly once

    loaders.__resetDataFileCache();
  });

  it("returns a fresh instance on every call outside production (dev/test)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const loaders = await import("@/data/loaders");

    const a = await loaders.loadPlayers(2024);
    const b = await loaders.loadPlayers(2024);

    expect(a).not.toBeNull();
    expect(a).not.toBe(b); // re-parsed each call — no caching in dev/test
  });
});
