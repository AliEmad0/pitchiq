import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MiniMapSide } from "@/features/game/components/MiniMapCanvas";
import { MiniMapCanvas } from "@/features/game/components/MiniMapCanvas";

/**
 * TASK-1810 — proof the mini-map actually PAINTS.
 *
 * ⚠️ happy-dom has no 2D context, so `getContext("2d")` returns null and the component
 * bails out silently. Every other test that renders the live screen would therefore pass
 * over a canvas that drew nothing at all — so this file installs a recording context and
 * asserts the calls.
 */
type Call = { op: string; args: unknown[] };

let calls: Call[] = [];
let getContextSpy: ReturnType<typeof vi.fn>;

function recordingContext(): CanvasRenderingContext2D {
  const rec =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args });
    };
  return {
    fillRect: rec("fillRect"),
    strokeRect: rec("strokeRect"),
    beginPath: rec("beginPath"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    stroke: rec("stroke"),
    fill: rec("fill"),
    arc: rec("arc"),
    ellipse: rec("ellipse"),
    fillText: rec("fillText"),
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set globalAlpha(_v: number) {},
    set font(_v: string) {},
    set textAlign(_v: string) {},
    set textBaseline(_v: string) {},
  } as unknown as CanvasRenderingContext2D;
}

const COLORS = {
  home: "#f2d98a",
  away: "#ff7d9b",
  inkHome: "#2b1e00",
  inkAway: "#2b0710",
  chalk: "#e8efe9",
  turfA: "#123a2a",
  turfB: "#0e3022",
};

const SLOTS = [
  { row: 1, col: 1 },
  { row: 2, col: 1 },
  { row: 2, col: 2 },
  { row: 2, col: 3 },
  { row: 2, col: 4 },
  { row: 3, col: 1 },
  { row: 3, col: 2 },
  { row: 3, col: 3 },
  { row: 3, col: 4 },
  { row: 4, col: 1 },
  { row: 4, col: 2 },
];

const side = (base: number, over: Partial<MiniMapSide> = {}): MiniMapSide => ({
  slots: SLOTS,
  // One entry per SLOT. `null` is a slot nobody occupies — a dismissal.
  players: SLOTS.map((_, i) => ({ playerId: base + i, number: i + 1 })),
  booked: [],
  captain: null,
  ...over,
});

/** The same side with two slots emptied, as a red card leaves them. */
const nineMen = (base: number): MiniMapSide => {
  const full = side(base);
  return {
    ...full,
    players: full.players.map((p, i) => (i === 3 || i === 4 ? null : p)),
  };
};

beforeEach(() => {
  calls = [];
  // happy-dom reports a 0×0 canvas; give it a real box or every draw short-circuits.
  vi.spyOn(HTMLCanvasElement.prototype, "clientWidth", "get").mockReturnValue(840);
  vi.spyOn(HTMLCanvasElement.prototype, "clientHeight", "get").mockReturnValue(544);
  getContextSpy = vi.fn(() => recordingContext());
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    getContextSpy as unknown as HTMLCanvasElement["getContext"],
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const draw = (over: { home?: MiniMapSide; away?: MiniMapSide; minute?: number } = {}) =>
  render(
    <MiniMapCanvas
      home={over.home ?? side(100)}
      away={over.away ?? side(200)}
      events={[]}
      minute={over.minute ?? 10}
      seed={7}
      reduced
      label="Both teams on the pitch"
      colors={COLORS}
    />,
  );

describe("MiniMapCanvas", () => {
  it("⛔ actually paints — turf, markings, players and the ball", () => {
    draw();
    expect(getContextSpy).toHaveBeenCalledWith("2d");

    // Striped turf.
    expect(calls.filter((c) => c.op === "fillRect").length).toBeGreaterThanOrEqual(12);
    // Touchlines + both penalty areas + both six-yard boxes.
    expect(calls.filter((c) => c.op === "strokeRect").length).toBeGreaterThanOrEqual(5);
    // 22 shirt numbers.
    expect(calls.filter((c) => c.op === "fillText")).toHaveLength(22);
    // The ball's ground shadow.
    expect(calls.filter((c) => c.op === "ellipse").length).toBeGreaterThanOrEqual(1);
  });

  it("draws one dot per OCCUPIED slot, and drops a dismissal", () => {
    draw({ home: nineMen(100) });
    expect(calls.filter((c) => c.op === "fillText")).toHaveLength(20);
  });

  it("⭐ a substitute inherits the slot and gets a dot under HIS number", () => {
    /**
     * Built from the starting eleven, a substitute has no dot at all — he holds the slot
     * his predecessor vacated under a different playerId — and his side finishes the match
     * with ten. Slot-keying is what prevents that.
     */
    const swapped = side(100);
    const withSub: MiniMapSide = {
      ...swapped,
      players: swapped.players.map((p, i) => (i === 6 ? { playerId: 999, number: 27 } : p)),
    };
    draw({ home: withSub });

    expect(calls.filter((c) => c.op === "fillText")).toHaveLength(22);
    const numbers = calls.filter((c) => c.op === "fillText").map((c) => c.args[0]);
    expect(numbers).toContain("27");
    // ⚠️ Counted, not `not.toContain("7")` — BOTH sides field a number 7 in this fixture,
    // so the away shirt keeps one. Only the home one is replaced.
    expect(numbers.filter((n) => n === "7")).toHaveLength(1);
  });

  it("exposes the shirt numbers as text, because a canvas is invisible to a reader", () => {
    draw({ home: side(100, { captain: 105, booked: [106] }) });
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(22);
    expect(items.some((li) => li.textContent?.includes("(C)"))).toBe(true);
    expect(items.some((li) => li.textContent?.includes("(booked)"))).toBe(true);
  });

  it("⛔ runs NO animation frame when motion is reduced", () => {
    const raf = vi.spyOn(window, "requestAnimationFrame");
    draw();
    expect(raf).not.toHaveBeenCalled();
  });

  it("carries the accessible label", () => {
    draw();
    expect(screen.getByRole("img", { name: "Both teams on the pitch" })).toBeInTheDocument();
  });
});
