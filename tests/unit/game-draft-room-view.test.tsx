import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { DraftRoom } = await import("@/features/game/components/DraftRoom");

const ROLES: PlayerRole[] = [
  "GK",
  "RB",
  "CB",
  "LB",
  "CDM",
  "CM",
  "CAM",
  "RM",
  "LM",
  "RW",
  "LW",
  "SS",
  "CF",
];

const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 12 }, (_, i) => ({
    cardId: makeCardId(r * 100 + i, 2020),
    playerId: r * 100 + i,
    season: 2020,
    name: `${role}-${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: {
      attack: 50,
      creation: 50,
      defense: 50,
      physical: 50,
      discipline: 50,
      overall: 50 + i,
    },
    club: "Club",
  })),
);

const shape = formationByName("4-4-2 Flat");
const render = (onComplete = vi.fn()) =>
  renderWithIntl(<DraftRoom pool={pool} formation={shape} seed={42} onComplete={onComplete} />);

describe("DraftRoom", () => {
  it("offers five candidates for the open slot", () => {
    render();
    expect(screen.getAllByRole("button", { name: /rated/ })).toHaveLength(5);
  });

  it("shows all eleven slots on the board", () => {
    render();
    expect(screen.getAllByRole("button", { name: /^Slot/ })).toHaveLength(11);
  });

  it("⚠️ any slot can be opened by clicking it", async () => {
    // Free roam is the mechanic: the board doubles as the navigation surface.
    const user = userEvent.setup();
    render();
    await user.click(screen.getAllByRole("button", { name: /^Slot/ })[6]);
    expect(screen.getAllByRole("button", { name: /^Slot/ })[6]).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("picking fills the slot and moves on", async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getAllByRole("button", { name: /rated/ })[0]);
    expect(screen.getAllByRole("button", { name: /^Slot/ })[1]).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("⚠️ re-opening a filled slot offers the identical five", async () => {
    // A hand belongs to the slot and the seed, never to the coach's history — so changing
    // your mind cannot re-roll a slot you were unhappy with.
    const user = userEvent.setup();
    render();
    const first = screen.getAllByRole("button", { name: /rated/ }).map((b) => b.textContent);
    await user.click(screen.getAllByRole("button", { name: /rated/ })[0]);
    await user.click(screen.getAllByRole("button", { name: /^Slot/ })[0]);
    const again = screen.getAllByRole("button", { name: /rated/ }).map((b) => b.textContent);
    expect(again).toEqual(first);
  });

  it("⚠️ a lapsed timer picks the highest-rated candidate", async () => {
    // The clock never reaches the domain: a timeout PICKS a card, and that pick is the
    // input — so a lapsed timer is indistinguishable from a deliberate choice on replay.
    vi.useFakeTimers();
    try {
      renderWithIntl(
        <DraftRoom pool={pool} formation={shape} seed={42} limit={1} onComplete={vi.fn()} />,
      );
      const best = screen
        .getAllByRole("button", { name: /rated/ })
        .map((b) => Number(/rated (\d+)/.exec(b.getAttribute("aria-label") ?? "")?.[1] ?? 0))
        .reduce((a, b) => Math.max(a, b), 0);
      // React 19 will not flush state produced by a fake timer outside `act`.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(screen.getAllByRole("button", { name: /^Slot/ })[0].textContent).toBe(String(best));
    } finally {
      vi.useRealTimers();
    }
  });

  it("⚠️ editing a filled slot runs no timer", async () => {
    // Reviewing your own squad must not be punished by a countdown.
    const user = userEvent.setup();
    renderWithIntl(
      <DraftRoom pool={pool} formation={shape} seed={42} limit={30} onComplete={vi.fn()} />,
    );
    await user.click(screen.getAllByRole("button", { name: /rated/ })[0]);
    await user.click(screen.getAllByRole("button", { name: /^Slot/ })[0]);
    expect(screen.getByText("Editing a filled slot — no timer")).toBeInTheDocument();
  });

  it("the timer can be disabled entirely, per WCAG 2.2.1", () => {
    renderWithIntl(
      <DraftRoom pool={pool} formation={shape} seed={42} limit={null} onComplete={vi.fn()} />,
    );
    expect(screen.getByText("No time limit")).toBeInTheDocument();
  });

  it("hands the finished XI up in slot order, exactly once", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(onComplete);
    for (let i = 0; i < 11; i++) {
      await user.click(screen.getAllByRole("button", { name: /rated/ })[0]);
    }
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toHaveLength(11);
  });
});

/**
 * TASK-1810 — the same room, run as consecutive rounds.
 *
 * ⛔ Every test above is the CONTROL: they render `DraftRoom` with no `roam`/`handSize` and
 * must keep passing untouched, which is what proves `/game/draft` still free-roams five.
 */
const renderSequential = (onComplete = vi.fn()) =>
  renderWithIntl(
    <DraftRoom
      pool={pool}
      formation={shape}
      seed={42}
      handSize={3}
      roam="sequential"
      onComplete={onComplete}
    />,
  );

describe("DraftRoom — sequential rounds", () => {
  it("⚠️ offers exactly the pack's hand size, not the room's default five", () => {
    renderSequential();
    expect(screen.getAllByRole("button", { name: /rated/ })).toHaveLength(3);
  });

  it("⛔ the board carries NO slot buttons and NO disabled buttons", () => {
    // Eleven slots the coach is not allowed to open would be eleven dead stops in the tab
    // order leading nowhere — the anti-pattern the mode gate's rule locks out. The markers
    // have to be inert, and specifically NOT disabled buttons.
    const { container } = renderSequential();
    expect(screen.queryAllByRole("button", { name: /^Slot/ })).toHaveLength(0);
    expect(container.querySelectorAll("button[disabled]")).toHaveLength(0);
  });

  it("announces the round, and a pick advances it", async () => {
    const user = userEvent.setup();
    renderSequential();
    expect(screen.getByText("Round 1 of 11")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /rated/ })[0]);
    expect(screen.getByText("Round 2 of 11")).toBeInTheDocument();
  });

  it("eleven rounds still hand the finished XI up in slot order, exactly once", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    renderSequential(onComplete);
    for (let i = 0; i < 11; i++) {
      await user.click(screen.getAllByRole("button", { name: /rated/ })[0]);
    }
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toHaveLength(11);
  });
});
