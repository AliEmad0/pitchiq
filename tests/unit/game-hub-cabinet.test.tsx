import { readFileSync } from "node:fs";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GAME_MODES, isPlayable } from "@/features/game/domain/modes";
import { ModeGate } from "@/features/game/components/ModeGate";
import { renderWithIntl } from "./_helpers/intl";

/**
 * TASK-1833 — the game hub as an ARCADE CABINET.
 *
 * The owner's pick from the 30-concept ritual TASK-1832 deferred on purpose, refined over
 * two further rounds: neon outline marks, a per-mode accent, and a cursor-select format
 * step. These assert the parts that carry MEANING, not the styling.
 */
describe("the cabinet", () => {
  it("frames the roster with a marquee and states the unlock ratio", () => {
    renderWithIntl(<ModeGate />);
    expect(screen.getByText("Select your game")).toBeInTheDocument();
    // ⭐ The ratio the ticket was about, stated rather than hidden: four of eleven.
    const unlocked = GAME_MODES.filter(isPlayable).length;
    expect(
      screen.getByText(new RegExp(`${unlocked} of ${GAME_MODES.length} modes unlocked`)),
    ).toBeInTheDocument();
  });

  /**
   * ⚠️ The count is a number inside a SENTENCE, so it stays prose and localizes — the
   * digit rule TASK-1840 settled pins minutes, scorelines, shirt numbers and ratings to
   * Western in every locale, and this is none of those.
   */
  it("prints the unlock count in Eastern-Arabic digits on ar", () => {
    const { container } = renderWithIntl(<ModeGate />, "ar");
    const coin = container.querySelector(".mg-coin")?.textContent ?? "";
    expect(coin).toMatch(/[٠-٩]/);
    expect(coin).not.toMatch(/[0-9]/);
  });

  it("gives every mode its own mark", () => {
    const { container } = renderWithIntl(<ModeGate />);
    expect(container.querySelectorAll(".mg-mark")).toHaveLength(GAME_MODES.length);
  });

  /**
   * ⭐ Colour is the hierarchy (owner, round 2). Seven of eleven modes are locked, and the
   * old gate answered that with opacity alone — which read as an unfinished game.
   */
  it("gives every mode its OWN accent, all eleven distinct", () => {
    const { container } = renderWithIntl(<ModeGate />);
    const accents = [...container.querySelectorAll<HTMLElement>(".mg-slot")].map((el) =>
      el.style.getPropertyValue("--mg-a"),
    );
    expect(accents).toHaveLength(GAME_MODES.length);
    expect(accents.every(Boolean)).toBe(true);
    expect(new Set(accents).size).toBe(GAME_MODES.length);
  });

  /**
   * ⛔ The rule the whole gate is built around, restated for the new markup: a locked mode
   * is not a control. Seven disabled buttons would be seven dead stops in the tab order.
   */
  it("⛔ keeps unbuilt modes INERT — no button, no tab stop, never disabled", () => {
    const { container } = renderWithIntl(<ModeGate />);
    const off = [...container.querySelectorAll(".mg-slot-off")];
    expect(off).toHaveLength(GAME_MODES.length - GAME_MODES.filter(isPlayable).length);
    for (const el of off) {
      expect(el.tagName).toBe("DIV");
      expect(el.hasAttribute("tabindex")).toBe(false);
      expect(el.querySelectorAll("button, a")).toHaveLength(0);
    }
    expect(container.querySelectorAll("[disabled]")).toHaveLength(0);
  });
});

describe("the cursor-select format step", () => {
  it("puts a cursor on what can be played and none on what cannot", async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(<ModeGate />);
    // Tactical H2H — one live format, one planned.
    await user.click(screen.getByRole("button", { name: /Tactical H2H/ }));

    expect(screen.getByText("Select length")).toBeInTheDocument();
    const rows = [...container.querySelectorAll(".mg-fmt-row")];
    expect(rows).toHaveLength(2);

    const live = rows.find((r) => r.classList.contains("mg-fmt-on"))!;
    const planned = rows.find((r) => !r.classList.contains("mg-fmt-on"))!;
    // ⚠️ A live format is a real link; a planned one is TEXT, never a disabled control.
    expect(live.tagName).toBe("A");
    expect(planned.tagName).toBe("P");
    expect(planned.hasAttribute("tabindex")).toBe(false);
    // The cursor itself is the difference, and it is visible before you read a word.
    expect(live.querySelector(".mg-fmt-cur")?.textContent).toBe("▶");
    expect(planned.querySelector(".mg-fmt-cur")?.textContent).toBe("");
  });
});

/**
 * The transition is the owner's HYBRID of animation concepts 03 + 07 + 21.
 *
 * ⭐ Asserted as a CSS CONTRACT, the same way `game-legacy-theme.test.ts` guards its
 * palette: a renamed keyframe does not fail a component test — the animation simply
 * resolves to `none` and the element sits still, which no DOM assertion can see.
 */
describe("the expand-in-place transition", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  it("composes three treatments on three different elements", () => {
    for (const name of ["mg-flicker", "mg-bloom", "mg-dim-on", "mg-dim-off"]) {
      expect(css, `@keyframes ${name} is missing`).toContain(`@keyframes ${name}`);
    }
    // ⭐ Why the hybrid works: different element, different property, each time.
    expect(css).toMatch(/\.mg-slot-open \.mg-fmt \{\s*animation: mg-flicker/);
    expect(css).toMatch(/\.mg-slot-open \{\s*animation: mg-bloom/);
    expect(css).toMatch(/\.mg-cab:has\(\.mg-slot-open\) \.mg-slot-on:not\(\.mg-slot-open\)/);
  });

  /**
   * ⛔ Two dim rules, not one. A single `:not(.mg-slot-open)` rule animates from
   * opacity 1, so every unbuilt mode would FLASH BRIGHTER before dimming — they already
   * sit at .4. Found by composing the hybrid, not by reading either concept alone.
   */
  it("⛔ dims a locked slot from where it already is, so it cannot flash brighter", () => {
    const kf = css.slice(css.indexOf("@keyframes mg-dim-off"));
    expect(kf).toMatch(/from \{\s*opacity: 0\.4;/);
    expect(kf).toMatch(/to \{\s*opacity: 0\.22;/);
    /**
     * ⛔ The RULE must exist, not merely the selector. The first version of this
     * assertion was `css.toContain(selector)` — which stayed green with the rule
     * deleted, because the same selector also appears in the reduced-motion gate
     * further down the file. Sabotage caught it.
     */
    expect(css).toMatch(/\.mg-cab:has\(\.mg-slot-open\) \.mg-slot-off \{\s*animation: mg-dim-off/);
    /** And the collapsed single-rule form must NOT be there — it is the bug itself. */
    expect(css).not.toMatch(/\.mg-cab:has\(\.mg-slot-open\) \.mg-slot:not\(\.mg-slot-open\)/);
  });

  it("⚠️ reduce-gates all three halves, not just the one that moves most", () => {
    /**
     * ⚠️ EVERY reduce block, not `lastIndexOf`. That assumed the cabinet's gate was the last
     * one in the sheet, and it stopped being so the moment another surface added its own
     * (the season hub, TASK-1811) — after which this reported the cabinet ungated while it
     * had been gated all along.
     */
    const gates = [
      ...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g),
    ].map((m) => m[0]);
    expect(gates.length).toBeGreaterThan(0);
    for (const sel of [".mg-slot-open", ".mg-slot-open .mg-fmt", ".mg-slot-off"]) {
      expect(
        gates.some((gate) => gate.includes(sel)),
        `${sel} is not reduce-gated`,
      ).toBe(true);
    }
  });

  /**
   * ⛔ Nothing animates height — the motion audit rejects layout properties outright.
   *
   * ⚠️ Scoped to the CABINET'S OWN KEYFRAMES, not "every byte below this point in the file".
   * The slice ran to EOF, so the first unrelated rule added underneath it — the season hub's
   * `padding` (TASK-1811) — failed a test about the cabinet's animation, naming neither the
   * rule nor the property. A keyframe is the only place a property is animated at all;
   * `motion-audit.test.ts` holds the global allowlist for the rest of the sheet.
   */
  it("⛔ animates no layout property", () => {
    const blocks = [...css.matchAll(/@keyframes\s+mg-[\w-]+\s*\{[\s\S]*?\n\}/g)].map((m) => m[0]);
    // The three halves of the owner's hybrid — flicker, bloom, neighbour dim.
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    for (const block of blocks) {
      const name = /@keyframes\s+(\S+)/.exec(block)?.[1];
      expect(block, `${name} animates a layout property`).not.toMatch(
        /\b(height|width|margin|padding|top|left):/,
      );
    }
  });
});
