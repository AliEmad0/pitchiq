import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PostMatchReport } from "@/features/game/components/PostMatchReport";
import type { MatchEvent, MatchResult } from "@/features/game/domain/match-types";
import type { GamePlayer } from "@/features/game/domain/player";
import { makeGameTeam } from "@/features/game/domain/team";
import { renderWithIntl } from "./_helpers/intl";

/**
 * TASK-1815 motion — the owner's HYBRID of three gallery designs:
 * 17 Ripple (rings out from the centre) → 1 Needle Drop (the disc spins in, spokes grow
 * minute by minute) → 18 Turntable (the record turns three times, then rests).
 *
 * ⛔ Needle Drop and Turntable BOTH animate `transform` on the disc. On one element the
 * later declaration wins and the other silently never runs (the TASK-1833 hybrid lesson),
 * so they live on two NESTED groups. These tests assert the RULES — `selector {` carrying
 * `animation:` — never the bare selector, which the reduce gate also contains and which
 * would keep a selector-only test green with the animation deleted.
 */
const css = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");

/** The body of the first plain rule for `selector` (outside any @media). */
function ruleBody(selector: string): string | null {
  const re = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`);
  return re.exec(css)?.[2] ?? null;
}

const ANIMATED: Record<string, string> = {
  ".pmr-ripple": "pmr-ripple",
  ".pmr-disc-in": "pmr-spin-in",
  ".pmr-disc-turn": "pmr-turn",
  ".pmr-spoke": "pmr-spoke-grow",
  ".pmr-copy": "pmr-rise",
};

describe("post-match report motion — CSS", () => {
  it("each layer carries its own animation", () => {
    for (const [selector, keyframes] of Object.entries(ANIMATED)) {
      const body = ruleBody(selector);
      expect(body, `${selector} rule`).not.toBeNull();
      expect(body!, `${selector} animation`).toMatch(new RegExp(`animation:[^;]*${keyframes}`));
      expect(css, `@keyframes ${keyframes}`).toContain(`@keyframes ${keyframes} {`);
    }
  });

  it("⛔ spin-in and turntable are on DIFFERENT elements, never the same one", () => {
    expect(ruleBody(".pmr-disc-in")!).not.toMatch(/pmr-turn/);
    expect(ruleBody(".pmr-disc-turn")!).not.toMatch(/pmr-spin-in/);
  });

  it("⛔ the turntable spins a FINITE 3 turns and stops (owner, 2026-10-13)", () => {
    // An endless turn had no pause control (WCAG 2.2.2) and repainted an idle screen
    // forever. Whole turns, so it comes to rest with minute 0 back at the top.
    const turn = ruleBody(".pmr-disc-turn")!;
    expect(turn).toMatch(/animation:[^;]*pmr-turn[^;]* 3;/);
    expect(turn).not.toMatch(/infinite/);
    expect(css).toMatch(/@keyframes pmr-turn \{\s*to \{\s*transform: rotate\(360deg\);/);
    for (const s of [".pmr-ripple", ".pmr-disc-in", ".pmr-spoke", ".pmr-copy"])
      expect(ruleBody(s)!, s).not.toMatch(/infinite/);
  });

  it("⛔ reduced motion stops EVERY layer, the turntable included", () => {
    const gate =
      /@media \(prefers-reduced-motion: reduce\) \{\s*(\.pmr-[^{]+)\{\s*animation: none;\s*\}/.exec(
        css,
      );
    expect(gate, "pmr reduce gate").not.toBeNull();
    for (const selector of Object.keys(ANIMATED)) expect(gate![1]).toContain(selector);
  });

  it("the headline sets in CAPITALS, names included (no 'JOB DONE FOR Arsenal')", () => {
    // The English wordings are written in caps but {coach}/{player} arrive mixed-case.
    // `text-transform` is a no-op for Arabic, which has no case.
    expect(ruleBody(".pmr-headline")!).toMatch(/text-transform: uppercase/);
  });

  it("a ripple is invisible at rest, so no-animation leaves no stray rings", () => {
    expect(ruleBody(".pmr-ripple")!).toMatch(/opacity: 0/);
  });
});

const p = (id: number, name: string) =>
  ({
    cardId: `${id}@2020`,
    playerId: id,
    season: 2020,
    name,
    role: "CF",
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 50 },
  }) as unknown as GamePlayer;
const shape = { name: "", season: 2020, slots: [] };

describe("post-match report motion — markup", () => {
  it("nests the turntable inside the spin-in, and times each spoke by its minute", () => {
    const result: MatchResult = {
      seed: 1,
      score: { home: 0, away: 0 },
      events: [
        { minute: 0, kind: "kickoff" },
        { minute: 45, kind: "chance", side: "home", outcome: "saved" },
        { minute: 90, kind: "fulltime" },
      ] as MatchEvent[],
    };
    const { container } = renderWithIntl(
      <PostMatchReport
        result={result}
        home={makeGameTeam(1, "H", 2020, shape, [p(1, "A")])}
        away={makeGameTeam(2, "A", 2020, shape, [p(2, "B")])}
        coachSide="home"
        locale="en"
      />,
    );
    expect(container.querySelectorAll(".pmr-ripple")).toHaveLength(2);
    const turn = container.querySelector(".pmr-disc-in > .pmr-disc-turn");
    expect(turn, "turntable nested in spin-in").not.toBeNull();
    const spoke = turn!.querySelector<SVGElement>('[data-testid="report-shot"]')!;
    expect(spoke.style.getPropertyValue("--pmr-t")).toBe("0.500");
    expect(spoke.style.transformOrigin).not.toBe("");
  });
});
