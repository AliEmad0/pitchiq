// Imported for its side effect only — it installs a real IDBFactory on globalThis.
// Scoped to this file rather than tests/setup.ts so no other suite gains a storage API
// it never asked for. The test environment is happy-dom, which has no IndexedDB at all.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { idbDel, idbGet, idbPut } from "@/features/game/storage/idb";

describe("idb", () => {
  beforeEach(async () => {
    await idbDel("match", "k");
  });

  it("round-trips a value", async () => {
    await idbPut("match", "k", { a: 1, b: "two" });
    expect(await idbGet("match", "k")).toEqual({ a: 1, b: "two" });
  });

  it("returns null for a key that was never written", async () => {
    expect(await idbGet("match", "missing")).toBeNull();
  });

  it("overwrites on a second put", async () => {
    await idbPut("match", "k", { a: 1 });
    await idbPut("match", "k", { a: 2 });
    expect(await idbGet("match", "k")).toEqual({ a: 2 });
  });

  it("deletes", async () => {
    await idbPut("match", "k", { a: 1 });
    await idbDel("match", "k");
    expect(await idbGet("match", "k")).toBeNull();
  });

  it("deleting a missing key is not an error", async () => {
    await expect(idbDel("match", "never-there")).resolves.toBeUndefined();
  });
});
