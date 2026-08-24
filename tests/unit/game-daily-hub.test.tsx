import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { msToNextUtcDay } from "@/features/game/domain/daily";
import { recentOutcomes } from "@/features/game/domain/daily-stats";
import { roomDeals } from "@/features/game/domain/draft-room";
import { formationByName } from "@/features/game/domain/formation";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { DailyHub } = await import("@/features/game/components/DailyHub");

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

/**
 * Ten players per role, each with TWO seasons — twenty cards, ten men.
 *
 * ⚠️ Ten rather than six: `onePerPlayer` spends men across the WHOLE board, so a shape
 * with two centre-backs needs ten of them to deal two full hands of five. At six the
 * second hand came up short and the board offered 43 cards instead of 55.
 *
 * ⛔ The two seasons are what make `onePerPlayer` observable at all, and the first version
 * of this file missed it: with one card per player the flag changes nothing, because the
 * card key and the player key partition the pool identically. The rule only bites when the
 * same man can be dealt twice in different shirts — which is exactly the real pool's shape
 * (252 cards, 203 distinct players).
 *
 * One man per role is rated 80+, so a standout is scarce rather than everywhere.
 */
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 10 }, (_, p) => p).flatMap((p) =>
    [2020, 2021].map((season) => ({
      cardId: makeCardId(r * 20 + p, season),
      playerId: r * 20 + p,
      season,
      // The NAME identifies the man, not the card — two seasons share it, which is how
      // "offered twice" becomes visible from the accessible label.
      name: `${role}-${p}`,
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
        overall: (p < 9 ? 55 + p * 2 : 80) + (season === 2021 ? 2 : 0),
      },
      club: "Club",
    })),
  ),
);

const formation = formationByName("4-4-2 Flat");
const stats = { played: 12, won: 9, currentStreak: 5, bestStreak: 9, bestMargin: 4 };

const mount = (onComplete = vi.fn()) =>
  renderWithIntl(
    <DailyHub
      pool={pool}
      today="2026-08-23"
      dayNumber={7}
      formation={formation}
      seed={1234}
      stats={stats}
      history={[]}
      onComplete={onComplete}
    />,
  );

describe("msToNextUtcDay", () => {
  it("counts to the next UTC midnight, never the local one", () => {
    // 22:00 UTC → two hours left, whatever timezone the machine runs in.
    expect(msToNextUtcDay(new Date("2026-08-23T22:00:00Z"))).toBe(2 * 3600_000);
    expect(msToNextUtcDay(new Date("2026-08-23T00:00:00Z"))).toBe(24 * 3600_000);
  });

  it("never returns more than a day, or zero at the boundary", () => {
    const ms = msToNextUtcDay(new Date("2026-08-23T23:59:59Z"));
    expect(ms).toBe(1000);
  });
});

describe("recentOutcomes", () => {
  const record = (day: string, home: number, away: number) => ({
    day,
    done: true,
    score: { home, away },
  });

  it("walks the CALENDAR, so a skipped day is unplayed rather than closed over", () => {
    // Won the 20th and the 22nd, never played the 21st.
    const out = recentOutcomes(
      [record("2026-08-20", 2, 0), record("2026-08-22", 1, 0)],
      "2026-08-23",
      4,
    );
    expect(out.map((d) => d.state)).toEqual(["won", "unplayed", "won", "today"]);
    expect(out.map((d) => d.day)).toEqual(["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23"]);
  });

  it("marks a loss as lost and today as today whatever today's record says", () => {
    const out = recentOutcomes(
      [record("2026-08-22", 0, 3), record("2026-08-23", 5, 0)],
      "2026-08-23",
      2,
    );
    expect(out.map((d) => d.state)).toEqual(["lost", "today"]);
  });
});

describe("DailyHub", () => {
  it("leads with the clock, then the day and the streak", () => {
    mount();
    expect(screen.getByTestId("daily-countdown").textContent).toMatch(/^\d\d:\d\d:\d\d$/);
    expect(screen.getByTestId("daily-day")).toHaveTextContent("7");
    // The shelf carries the records, and the streak reads from the stats it was given.
    expect(screen.getByTestId("daily-shelf")).toHaveTextContent("9");
    expect(screen.getByTestId("daily-shelf")).toHaveTextContent("5");
  });

  it("shows the month as 28 squares with today marked", () => {
    mount();
    const heat = screen.getByTestId("daily-heat");
    expect(heat.querySelectorAll(".dh-day")).toHaveLength(28);
    expect(heat.querySelectorAll(".dh-day-today")).toHaveLength(1);
  });

  it("⚠️ keeps the pick overlay CLOSED until the coach opens it", () => {
    // The hub is a page, not a modal: landing on it must not trap the coach in a dialog.
    mount();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /Start picking/ })).toBeInTheDocument();
  });

  /** Walk the whole board, returning what every hand offered along the way. */
  async function walkBoard(user: ReturnType<typeof userEvent.setup>) {
    const hands: Array<Array<{ name: string; ovr: number }>> = [];
    for (let i = 0; i < 11; i++) {
      const dialog = screen.queryByRole("dialog");
      if (dialog == null) break;
      const cards = within(dialog).getAllByRole("button", { name: /rated \d+/ });
      hands.push(
        cards.map((c) => {
          const label = c.getAttribute("aria-label") ?? "";
          return {
            name: /Choose ([^,]+),/.exec(label)![1]!,
            ovr: Number(/rated (\d+)/.exec(label)![1]),
          };
        }),
      );
      await user.click(cards[0]!);
    }
    return hands;
  }

  it("⛔ deals with the standout + one-per-player rules the screen promises", async () => {
    /**
     * Asserts the hub's WIRING against the domain deal, not a property of the cards.
     *
     * ⚠️ Two weaker versions of this test were vacuous. "The hand holds an 80+" passes by
     * luck on a generous pool; and demanding it of every hand asserts more than
     * `roomDeals` promises — it documents a fallback to the best available once a
     * position's standouts are spent, which a two-centre-back shape reaches on its own.
     * Comparing against the deal those exact options produce is the thing that actually
     * goes red when the flags change, which is what the copy on screen depends on.
     */
    const expected = roomDeals(pool, formation, 1234, { standout: true, onePerPlayer: true });
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: /Start picking/ }));

    const hand = within(screen.getByRole("dialog")).getAllByRole("button", { name: /rated \d+/ });
    expect(hand).toHaveLength(5);
    const shown = hand.map((c) => /Choose ([^,]+),/.exec(c.getAttribute("aria-label") ?? "")![1]);
    expect(new Set(shown)).toEqual(new Set(expected[0]!.map((c) => c.name)));
  });

  it("⛔ no player is offered TWICE across the board, so a pick cannot be undone by a redeal", async () => {
    // ⚠️ Checked across the WHOLE board, not between the first two slots: those are a
    // goalkeeper and a left-back, where a repeat is impossible whatever the rules say —
    // the version of this test that looked there passed with `onePerPlayer` switched off.
    // The repeats live between the two centre-backs, the two centre-mids and the two
    // strikers, which only a full walk reaches.
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: /Start picking/ }));

    const offered = (await walkBoard(user)).flat().map((c) => c.name);
    expect(offered).toHaveLength(55);
    expect(new Set(offered).size).toBe(offered.length);
  });

  it("⛔ hands the XI up ONCE and closes itself on the eleventh pick", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    mount(onComplete);
    await user.click(screen.getByRole("button", { name: /Start picking/ }));

    for (let i = 0; i < 11; i++) {
      const cards = screen.queryAllByRole("button", { name: /rated \d+/ });
      if (cards.length === 0) break;
      await user.click(cards[0]!);
    }

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toHaveLength(11);
  });
});
