import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_MODES } from "@/features/game/domain/modes";
import { CHAOS_PACK, LEGACY_CLUBS, RULE_PACKS, packFor } from "@/features/game/domain/rule-packs";

describe("rule packs", () => {
  it("every pack id is a real mode id", () => {
    const ids = new Set(GAME_MODES.map((m) => m.id));
    for (const pack of RULE_PACKS) expect(ids.has(pack.id)).toBe(true);
  });

  it("packFor resolves a known id and refuses an unknown one", () => {
    expect(packFor("legacy")?.id).toBe("legacy");
    // ⚠️ null, never a throw: the mode comes from a URL segment a stranger controls.
    expect(packFor("nonsense")).toBeNull();
  });

  it("⚠️ Legacy offers exactly the TEN owner-chosen clubs", () => {
    // Pinned because the club menu IS the payload decision — one prerendered page holds
    // every selectable club's cards, so silently growing this grows the static payload.
    expect(LEGACY_CLUBS).toEqual([33, 40, 47, 42, 49, 45, 66, 34, 48, 50]);
  });

  it("Legacy's recipe is club-history shaped and Chaos's is top-teams shaped", () => {
    const legacy = packFor("legacy")!;
    expect(legacy.pool.kind).toBe("clubHistory");
    if (legacy.pool.kind !== "clubHistory") throw new Error("unreachable");
    expect(legacy.pool.teams).toEqual([...LEGACY_CLUBS]);
    expect(CHAOS_PACK.pool.kind).toBe("topTeams");
  });

  it("⚠️ Legacy needs a club chooser; Chaos needs none", () => {
    expect(packFor("legacy")!.chooser).toEqual({ kind: "club" });
    expect(CHAOS_PACK.chooser).toBeUndefined();
  });

  it("⚠️ Legacy drafts in 3-card sequential rounds; Chaos keeps the room's defaults", () => {
    // The owner's mechanic lives on the PACK, not inside a Legacy-specific component —
    // that is what hands Captain's Draft and Budget Cap the same two knobs later.
    expect(packFor("legacy")!.draft).toEqual({ handSize: 3, roam: "sequential" });
    // ⛔ Undefined, NOT a spelled-out `{ handSize: 5, roam: "free" }`. Chaos runs the
    // shipped hub, and restating its defaults here would make them a second source of
    // truth that could drift from `HAND_SIZE`.
    expect(CHAOS_PACK.draft).toBeUndefined();
  });

  it("⛔ domain/rule-packs.ts imports nothing from adapter/", () => {
    // The seam's entire value is this boundary — an adapter import here would let a client
    // component pull server-only code, which the game's layering forbids outright.
    const src = readFileSync(
      path.resolve(__dirname, "../../src/features/game/domain/rule-packs.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["'].*adapter/);
    expect(src).not.toMatch(/server-only/);
  });
});
