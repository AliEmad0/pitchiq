import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BENCH_SHAPE } from "@/features/game/domain/chaos-draft";
import { GAME_MODES } from "@/features/game/domain/modes";
import {
  BUDGET_PACK,
  CHAOS_PACK,
  LEGACY_CLUBS,
  RULE_PACKS,
  packFor,
  routedPacks,
} from "@/features/game/domain/rule-packs";

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

  it("⚠️ Legacy offers EVERY club, and says so as data rather than a list", () => {
    // This was a curated ten while one prerendered page had to hold every selectable
    // club's cards. The club is a route segment now, so breadth costs pages, not payload —
    // and the club set is resolved from the standings so it cannot rot as seasons land.
    expect(LEGACY_CLUBS).toBe("all");
  });

  it("Legacy's recipe is club-history shaped and Chaos's is top-teams shaped", () => {
    const legacy = packFor("legacy")!;
    expect(legacy.pool.kind).toBe("clubHistory");
    if (legacy.pool.kind !== "clubHistory") throw new Error("unreachable");
    expect(legacy.pool.teams).toBe("all");
    expect(CHAOS_PACK.pool.kind).toBe("topTeams");
  });

  it("⚠️ Legacy needs a club chooser; Chaos needs none", () => {
    expect(packFor("legacy")!.chooser).toEqual({ kind: "club" });
    expect(CHAOS_PACK.chooser).toBeUndefined();
  });

  it("⚠️ Legacy deals five, free-roam, final picks and no clock; Chaos keeps the defaults", () => {
    // The owner's mechanic lives on the PACK, not inside a Legacy-specific component —
    // that is what hands Captain's Draft and Budget Cap the same knobs later.
    //
    // ⚠️ `timer: null` is asserted explicitly. It is the one field whose ABSENCE would be
    // silently wrong: undefined falls through to the room's shipped 15-second countdown,
    // which would put a clock on a decision that cannot be revised.
    expect(packFor("legacy")!.draft).toEqual({
      handSize: 5,
      roam: "free",
      timer: null,
      lockPicks: true,
      standout: true,
      onePerPlayer: true,
    });
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

describe("screens (TASK-1810)", () => {
  it("Legacy declares the programme + split-feed screens", () => {
    expect(packFor("legacy")?.screens).toBe("legacy");
  });

  it("⛔ a pack that does not declare them keeps the SHIPPED match screens", () => {
    // The control for TASK-1810: Chaos must reach MatchupPreview/MatchView exactly as it
    // always has. `screens` being optional is the whole reason the redesign is contained.
    expect(CHAOS_PACK.screens).toBeUndefined();
  });
});

describe("budget pack (TASK-1810)", () => {
  it("is a priced cross-era pool under a cap", () => {
    expect(BUDGET_PACK.pool).toEqual({ kind: "pricedMarket", cap: 600, baseSeason: 2025 });
    // £120.0m in tenths — and it buys SIXTEEN players, not eleven. Measured over 60 rooms:
    // a squad costs £64m at the floor and £211m taking the dearest card every round.
    expect(BUDGET_PACK.constraints).toEqual([{ kind: "budgetCap", amount: 1200 }]);
    expect(BUDGET_PACK.screens).toBe("legacy");
  });

  it("⛔ faces a BUDGET-matched rival, never the best available", () => {
    // Measured: the unlimited ceiling XI is mean 94.0 against the coach's 80.8 at €100M — a
    // 13-point gap settled by the draft rules before a ball is kicked.
    expect(BUDGET_PACK.opponent).toBe("budget");
  });

  it("⚠️ guarantees no standout — a forced 80+ fights a budget", () => {
    expect(BUDGET_PACK.draft?.standout).toBeUndefined();
    expect(BUDGET_PACK.draft?.cheapest).toBe(true);
    expect(BUDGET_PACK.draft?.onePerPlayer).toBe(true);
  });

  it("⭐ picks are NOT final, and the coach confirms when he is ready", () => {
    // ⛔ The two go together (owner, 2026-08-26). The activity is trying combinations until
    // the money works, so a locked pick ends the mode on the first mistake — and auto-handing
    // off on the last pick would end it at the exact moment he wants to start swapping.
    expect(BUDGET_PACK.draft?.lockPicks).toBe(false);
    expect(BUDGET_PACK.draft?.confirm).toBe(true);
  });

  it("⭐ the coach drafts a BENCH, and its first slot is a keeper", () => {
    // "One of them must be a GK" is true by construction: `BENCH_SHAPE` opens with one.
    expect(BUDGET_PACK.draft?.bench).toBe(true);
    expect(BENCH_SHAPE[0]).toBe("GK");
  });

  it("⛔ has NO chooser, so the parameterised route must never serve it", () => {
    // The pool is one cross-era set, so there is nothing to choose. A chooser here would fan
    // out `[mode]/[club]` and break the Vercel build, exactly as Captain's Draft did.
    expect(BUDGET_PACK.chooser).toBeUndefined();
    expect(routedPacks().map((p) => p.id)).not.toContain("budget");
  });

  it("is registered and resolvable by id", () => {
    expect(RULE_PACKS.map((p) => p.id)).toContain("budget");
    expect(packFor("budget")).toBe(BUDGET_PACK);
  });
});
