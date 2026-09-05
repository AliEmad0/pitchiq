import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PlayerRole } from "@/data/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import { renderWithIntl } from "./_helpers/intl";

/**
 * ⛔ Motion ON, unlike every other season suite.
 *
 * `season-hub.test.tsx` mocks `prefersReducedMotion` to TRUE so its assertions are about the
 * table rather than the treatment — which means the whole animation path is unexercised there,
 * and the defect below lived under a green suite.
 */
vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => false }));
vi.mock("@/features/game/storage/season-slot", () => ({
  saveRun: vi.fn(async () => {}),
  loadRun: vi.fn(async () => null),
  clearRun: vi.fn(async () => {}),
}));

const { SeasonHub } = await import("@/features/game/components/SeasonHub");

const ROLES: PlayerRole[] = [
  "GK",
  "GK",
  "RB",
  "CB",
  "CB",
  "CB",
  "LB",
  "CDM",
  "CM",
  "CM",
  "CAM",
  "RM",
  "LM",
  "RW",
  "LW",
  "CF",
  "CF",
  "CF",
];

const poolFor = (clubId: number): PoolCard[] =>
  ROLES.map((role, i) => ({
    cardId: `${clubId * 100 + i}@2020`,
    playerId: clubId * 100 + i,
    season: 2020,
    name: `C${clubId} Player${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    club: `Club ${clubId}`,
    teamId: clubId,
    ratings: {
      attack: 50 + ((clubId + i) % 9),
      creation: 50,
      defense: 50 + ((clubId + i) % 6),
      physical: 50,
      discipline: 50,
      overall: 60 + ((clubId * 3 + i) % 30),
    },
  }));

const IDS = Array.from({ length: 20 }, (_, i) => i + 1);
const props = {
  coachId: 1,
  coachName: "Club 1",
  seed: 4242,
  pools: Object.fromEntries(IDS.map((id) => [id, poolFor(id)])),
  clubNames: Object.fromEntries(IDS.map((id) => [id, `Club ${id}`])),
  leagueIds: IDS,
  squad: poolFor(1).slice(0, 11),
  formation: formationByName("4-4-2 Flat"),
};

/**
 * ⚠️ happy-dom ships no Web Animations API, so the FLIP's `row.animate(...)` throws — which is
 * the real reason every other season suite runs with reduced motion ON, and the reason the
 * whole treatment went unexercised. Stubbing it is what lets motion be tested at all, and it
 * doubles as the probe for the one animation that was never broken.
 */
const animate = vi.fn(() => ({ cancel: () => {}, finished: Promise.resolve() }));
beforeEach(() => {
  animate.mockClear();
  (Element.prototype as unknown as { animate: unknown }).animate = animate;
});

describe("the matchweek animation (TASK-1811)", () => {
  it("⛔ RESTARTS every week — it is not a class that goes on once and stays", async () => {
    /**
     * ⛔ The defect this exists for: `sh-play` was added on the first advance and never
     * removed, and a CSS animation runs when its class ARRIVES. So the glow, the side slide,
     * the header nudge and the sweep played once per PAGE LOAD while every later matchweek
     * moved only the FLIP — which is imperative, so something always moved and the surface
     * looked correct. Found in a real browser on the Vercel preview, not here.
     *
     * ⚠️ Asserted as the class going OFF and back ON, because that is the only thing a DOM
     * test can see. "Does it still have sh-play?" is true in both the broken and the fixed
     * version, which is precisely how it survived.
     */
    const user = userEvent.setup();
    renderWithIntl(<SeasonHub {...props} />);
    const hub = screen.getByTestId("season-hub");

    await user.click(screen.getByRole("button", { name: /sim week/i }));
    await waitFor(() => expect(hub).toHaveClass("sh-play"));

    /**
     * ⚠️ `oldValue`, not `hub.className` read inside the callback. The remove and the re-add
     * happen in one synchronous block, so the observer fires ONCE with two records and a
     * callback that reads the live class sees only the settled value — which made this test
     * report a single mutation and pass the broken code for the wrong reason.
     */
    const seen: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) seen.push(record.oldValue ?? "");
    });
    observer.observe(hub, {
      attributes: true,
      attributeFilter: ["class"],
      attributeOldValue: true,
    });

    await user.click(screen.getByRole("button", { name: /sim week/i }));
    await waitFor(() => expect(screen.getByTestId("season-week")).toHaveTextContent(/2 of 38/));
    observer.disconnect();

    // It came off and went back on — two mutations, the first without the class.
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.some((c) => !c.includes("sh-play"))).toBe(true);
    expect(hub).toHaveClass("sh-play");
    // ⭐ And the FLIP ran on this week too — the one treatment that never broke, so a table
    // that has stopped moving altogether cannot pass this test by losing both.
    expect(animate).toHaveBeenCalled();
  });

  it("⚠️ and a reduced-motion coach is never given the class at all", async () => {
    // The treatment is decoration end to end — the table is correct without any of it.
    vi.resetModules();
    vi.doMock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
    const { SeasonHub: Reduced } = await import("@/features/game/components/SeasonHub");

    const user = userEvent.setup();
    renderWithIntl(<Reduced {...props} />);
    await user.click(screen.getByRole("button", { name: /sim week/i }));

    await waitFor(() => expect(screen.getByTestId("season-week")).toHaveTextContent(/1 of 38/));
    expect(screen.getByTestId("season-hub")).not.toHaveClass("sh-play");
    vi.doUnmock("@/utils/motion");
  });
});
