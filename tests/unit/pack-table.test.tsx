import { readFileSync } from "node:fs";
import path from "node:path";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RewardId } from "@/features/game/domain/market";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { renderWithIntl } from "./_helpers/intl";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => motion.reduced }));
const { PackTable, PACK_TIMING } = await import("@/features/game/components/PackTable");

/** Polish (owner, 2026-10-22) — Pack #1 Three-Card Table with motion #1 Triple Flip. */
const pack: RewardId[] = ["marquee", "gegenpress", "physio"];
const back = {
  cardId: "1@2020",
  playerId: 1,
  season: 2020,
  name: "Back",
} as unknown as EnrichedCard;
const table = () => screen.getByTestId("pack-table");
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  motion.reduced = false;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("PackTable", () => {
  it("⭐ arrive → closed → reveal (all three together) → open → keep → takes exactly once", async () => {
    const onTake = vi.fn();
    renderWithIntl(<PackTable pack={pack} backs={[back]} onTake={onTake} />);
    expect(table().dataset.ph).toBe("arrive");
    // Face down: three named images, no reward control in the tab order.
    expect(screen.getAllByRole("img", { name: "Face-down reward" })).toHaveLength(3);
    expect(screen.queryAllByTestId("market-reward")).toHaveLength(0);
    await advance(PACK_TIMING.arrive);
    expect(table().dataset.ph).toBe("closed");

    fireEvent.click(screen.getByTestId("market-open"));
    expect(table().dataset.ph).toBe("reveal");
    // During the flip nothing can be picked yet.
    expect(screen.queryAllByTestId("market-reward")).toHaveLength(0);
    await advance(PACK_TIMING.reveal);
    expect(table().dataset.ph).toBe("open");

    const rewards = screen.getAllByTestId("market-reward");
    expect(rewards.map((r) => r.dataset.reward)).toEqual(pack);
    for (const r of rewards) {
      expect(r.querySelector(".mm-boon")?.textContent).toMatch(/^＋ /);
      expect(r.querySelector(".mm-catch")?.textContent).toMatch(/^− /);
    }
    fireEvent.click(rewards[1]!);
    fireEvent.click(rewards[1]!);
    fireEvent.click(rewards[0]!);
    expect(table().dataset.ph).toBe("keep");
    expect(rewards[1]).toHaveClass("pk-kept");
    expect(rewards[0]).toHaveClass("pk-gone");
    expect(rewards[2]).toHaveClass("pk-gone");
    expect(onTake).not.toHaveBeenCalled(); // the halo plays first
    await advance(PACK_TIMING.keep);
    expect(onTake.mock.calls).toEqual([["gegenpress"]]);
  });

  it("Open during the arrival still reveals (the arrival timer cannot cancel the reveal)", async () => {
    renderWithIntl(<PackTable pack={pack} backs={[back]} onTake={vi.fn()} />);
    fireEvent.click(screen.getByTestId("market-open"));
    await advance(PACK_TIMING.reveal + PACK_TIMING.arrive);
    expect(table().dataset.ph).toBe("open");
  });

  it("reduced motion: no timed phases — closed, open on click, taken on click", () => {
    motion.reduced = true;
    const onTake = vi.fn();
    renderWithIntl(<PackTable pack={pack} backs={[back]} onTake={onTake} />);
    expect(table().dataset.ph).toBe("closed");
    fireEvent.click(screen.getByTestId("market-open"));
    expect(table().dataset.ph).toBe("open");
    fireEvent.click(screen.getAllByTestId("market-reward")[2]!);
    expect(onTake.mock.calls).toEqual([["physio"]]);
  });

  it("face-down cards wear the app's own CardBack, not a hand-drawn panel", () => {
    const { container } = renderWithIntl(<PackTable pack={pack} backs={[back]} onTake={vi.fn()} />);
    expect(container.querySelectorAll(".pk-back .pc-back")).toHaveLength(3);
  });
});

describe("Triple Flip CSS", () => {
  const css = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");
  const rule = (selector: string) => {
    const at = css.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf("}", at));
  };

  it("each phase RULE animates its own layer (assert the rule, not the selector)", () => {
    expect(rule('.pk-table[data-ph="arrive"] .pk-mv')).toContain("animation: pk-rise");
    expect(rule('.pk-table[data-ph="arrive"] .pk-mv')).toContain("calc(var(--i) * 80ms)");
    expect(rule('.pk-table[data-ph="reveal"] .pk-mv')).toContain("animation: pk-hop 0.7s");
    expect(rule('.pk-table[data-ph="reveal"] .pk-fl')).toContain("animation: pk-flip 0.6s");
    expect(rule('.pk-table[data-ph="keep"] .pk-kept .pk-mv')).toContain("animation: pk-keep");
    expect(rule('.pk-table[data-ph="keep"] .pk-gone .pk-mv')).toContain("animation: pk-out");
  });

  it("⛔ the scale sits on its own layer, never on the mover or the flipper", () => {
    expect(rule(".pk-sc")).toContain("transform: scale(var(--pk-s))");
    expect(rule(".pk-fl")).not.toContain("scale");
  });

  it("one reduce gate stops every animated pack layer", () => {
    const block = css.slice(css.indexOf("Pack three-card table + Triple Flip (polish)"));
    const at = block.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(at).toBeGreaterThan(-1);
    const gate = block.slice(at, block.indexOf("\n}\n", at));
    for (const sel of [".pk-table .pk-mv", ".pk-table .pk-fl", ".pk-table .pk-go"]) {
      expect(gate).toContain(sel);
    }
    expect(gate).toContain("animation: none !important");
  });
});
