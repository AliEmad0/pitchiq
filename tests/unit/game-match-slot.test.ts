import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { DecisionAnswer } from "@/features/game/domain/match-decisions";
import {
  clearMatch,
  loadMatch,
  saveMatch,
  type SavedMatch,
} from "@/features/game/storage/match-slot";

const record: SavedMatch = {
  cardIds: ["1000@2020", "1001@2020"],
  formationKey: "4-4-2/11",
  seed: 42,
  answers: [{ kind: "response", minute: 23, side: "home", choice: "overload" }],
  fingerprint: 123456,
  eventCount: 7,
};

describe("match slot", () => {
  beforeEach(async () => {
    await clearMatch();
  });

  it("round-trips a record", async () => {
    await saveMatch(record);
    expect(await loadMatch()).toEqual(record);
  });

  it("is empty before anything is saved", async () => {
    expect(await loadMatch()).toBeNull();
  });

  it("keeps only the most recent match", async () => {
    await saveMatch(record);
    await saveMatch({ ...record, seed: 99 });
    expect((await loadMatch())?.seed).toBe(99);
  });

  it("clears", async () => {
    await saveMatch(record);
    await clearMatch();
    expect(await loadMatch()).toBeNull();
  });

  it("⚠️ every answer kind survives the round trip", async () => {
    // A stored answer is replayed straight back into the engine, so anything JSON drops
    // silently produces a DIFFERENT match rather than an error. Pinned per kind so a
    // future answer variant carrying something unserialisable fails here.
    const answers: DecisionAnswer[] = [
      { kind: "response", minute: 23, side: "home", choice: "overload" },
      { kind: "sub-offer", minute: 60, side: "home", off: 501, on: 502, reason: "tactical" },
      { kind: "injury-sub", minute: 70, side: "home", on: 503 },
      { kind: "dismissal", minute: 80, side: "home", off: 504, on: 505 },
    ];
    await saveMatch({ ...record, answers });
    expect((await loadMatch())?.answers).toEqual(answers);
  });
});
