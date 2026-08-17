import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TASK-1809 — the animation chosen by the design-gallery pass.
 *
 * The owner picked a HYBRID of three gallery designs: 05 spring overshoot (the card's
 * entrance), 14 kinetic type (the content cascading up after it) and 15 slow burn (an
 * accent glow that grows and holds). These assertions pin the character of each half, not
 * merely that some animation exists — a keyframe can be renamed or flattened to a plain
 * fade and still "have an animation".
 */

const ROOT = path.resolve(__dirname, "../..");
const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");

/** Brace-matched, so a body can never run past its own closing brace. */
function block(source: string, opener: RegExp): string {
  const m = opener.exec(source);
  if (m == null) return "";
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
    i++;
  }
  return source.slice(start, i - 1);
}

const keyframe = (name: string) => block(css, new RegExp(`@keyframes ${name}\\s*\\{`));
const rule = (selector: string) =>
  block(css, new RegExp(`\\n${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`));

const CHILDREN = [
  ".game-event-icon",
  ".game-event-kind",
  ".game-event-who",
  ".game-event-line",
];

describe("TASK-1809 key-event animation", () => {
  it("defines all three keyframes the hybrid needs", () => {
    expect(keyframe("game-event-in")).not.toBe("");
    expect(keyframe("game-event-glow")).not.toBe("");
    expect(keyframe("game-event-rise")).not.toBe("");
  });

  it("⚠️ gallery 05 — the entrance OVERSHOOTS rather than easing in", () => {
    // A plain fade would satisfy "has an animation". The chosen design is a spring: it
    // starts well under full size and rides an overshoot curve back. Both halves are
    // load-bearing, so both are pinned.
    const from = /scale\(([\d.]+)\)/.exec(keyframe("game-event-in"));
    expect(from).not.toBeNull();
    expect(Number(from![1])).toBeLessThan(0.8);
    expect(rule(".game-event-overlay")).toMatch(/--ease-pop/);
  });

  it("⚠️ gallery 14 — the content cascades in a strict sequence", () => {
    // The cascade IS the design. Equal delays would render as one block fading in, which
    // is design 01, so the delays must strictly increase down the card.
    const delays = CHILDREN.map((sel) => {
      const body = rule(sel);
      expect(body, `${sel} has no rule`).not.toBe("");
      // `animation: game-event-rise <duration> <easing> <delay> both` — the delay is the
      // SECOND time value, so the shorthand's order is what is being read here.
      const m = /animation:\s*game-event-rise\s+\d+ms\s+\S+\s+(\d+)ms/.exec(body);
      expect(m, `${sel} does not run game-event-rise with a delay`).not.toBeNull();
      return Number(m![1]);
    });
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1]!);
    }
  });

  it("⚠️ gallery 15 — the glow GROWS, and it is built from the event's accent", () => {
    const glow = keyframe("game-event-glow");
    // Built from the event's accent, so a penalty never glows like a sending-off.
    expect(glow).toMatch(/--game-event-accent/);

    // The end state must carry a blur radius the start state does not — a box-shadow
    // that ends at `0 0 0 0` is not a glow, and would satisfy "has a box-shadow".
    const split = glow.indexOf("100%");
    const blurOf = (s: string) => {
      const m = /0 0 (\d+)px/.exec(s);
      return m ? Number(m[1]) : 0;
    };
    expect(blurOf(glow.slice(split))).toBeGreaterThan(blurOf(glow.slice(0, split)));
  });

  it("⛔ reduced motion silences the entrance AND every cascade step", () => {
    // The cascade is four separate animations on four elements. A gate covering only the
    // container leaves the content sliding for someone who asked it not to — and the
    // container-only version still looks correct in a screenshot.
    //
    // ⚠️ globals.css holds several reduce blocks. Slicing from the FIRST one would span
    // most of the file and pass on unrelated content, so find the block that actually
    // governs this overlay and assert against that body alone.
    const blocks: string[] = [];
    const re = /@media \(prefers-reduced-motion: reduce\)\s*\{/g;
    // The match itself is unused — `re.lastIndex` is what the brace walk needs.
    while (re.exec(css) !== null) {
      let depth = 1;
      let i = re.lastIndex;
      while (i < css.length && depth > 0) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}") depth--;
        i++;
      }
      blocks.push(css.slice(re.lastIndex, i - 1));
    }
    const own = blocks.filter((b) => b.includes(".game-event-overlay"));
    expect(own, "no reduce block mentions .game-event-overlay").toHaveLength(1);
    for (const sel of CHILDREN) {
      expect(own[0], `${sel} is not reduce-gated`).toContain(sel);
    }
    expect(own[0]).toMatch(/animation:\s*none/);
  });

  it("keeps every keyframe inside the motion-audit allowlist", () => {
    // Guarded globally by motion-audit.test.ts too; asserted here so this ticket's own
    // file fails loudly if someone reaches for `filter` to get a nicer glow.
    const allowed = new Set(["opacity", "transform", "box-shadow"]);
    for (const name of ["game-event-in", "game-event-glow", "game-event-rise"]) {
      for (const [, prop] of keyframe(name).matchAll(/([a-z-]+)\s*:/g)) {
        expect(allowed, `${name} animates ${prop}`).toContain(prop);
      }
    }
  });
});
