import { describe, expect, it } from "vitest";
import { chaosMatchup } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import { hashEvents } from "@/features/game/domain/hash";
import type { TacticalStyle } from "@/features/game/domain/opponent";
import { scoutedStyle } from "@/features/game/domain/style-scouting";
import { buildSession } from "@/features/game/view/match-session";
import golden from "./fixtures/session-legacy-golden.json";
import {
  drainSession,
  GOLDEN_RIVALS,
  squadFor,
  STYLE_NAMES,
  STYLE_POOL,
} from "./fixtures/style-pool";

/**
 * TASK-1825 — the coach's style is part of the match's IDENTITY. Absent, every match is the
 * one that shipped (old saves and v2 share links replay byte-for-byte); present, the coach's
 * pick meets an opponent style SCOUTED from the opponent's own XI.
 */
const f = formationByName("4-4-2 Flat");
const build = (seed: number, style?: TacticalStyle) =>
  buildSession(STYLE_POOL, squadFor(f), f, seed, STYLE_NAMES, style == null ? {} : { style });

describe("a coach's style in the match identity", () => {
  it("⛔ no style = the shipped match, byte for byte (old saves and v2 links)", () => {
    const now: Record<string, number[]> = {};
    for (const [name, rival] of GOLDEN_RIVALS)
      now[name] = Array.from({ length: 40 }, (_, i) => hashEvents(drainSession(i + 1, rival)));
    expect(now).toEqual(golden);
  }, 120_000);

  it("a chosen style is the coach's; the opponent's is scouted from its XI", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = build(seed, "counter");
      expect(s.styles).toEqual({ home: "counter", away: scoutedStyle(s.away.players, seed) });
    }
  });

  it("a style changes the match only through the modifier, never the squads", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const a = build(seed);
      const b = build(seed, "direct");
      expect(b.home.players.map((p) => p.cardId)).toEqual(a.home.players.map((p) => p.cardId));
      expect(b.away.players.map((p) => p.cardId)).toEqual(a.away.players.map((p) => p.cardId));
    }
  });

  it("a style does change the match (the modifier is wired)", () => {
    const differs = Array.from({ length: 20 }, (_, i) => i + 1).some(
      (seed) =>
        hashEvents(drainSession(seed, { style: "tiki-taka" })) !==
        hashEvents(drainSession(seed, { style: "low-block" })),
    );
    expect(differs).toBe(true);
  });

  it("styles are exposed without a pick too — the legacy draw", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const m = chaosMatchup(STYLE_POOL, seed, STYLE_NAMES);
      const away = m.opponent.kind === "squad" ? m.opponent.style : null;
      expect(build(seed).styles).toEqual({ home: m.homeStyle, away });
    }
  });
});
