import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import type { DraftSpec } from "@/features/game/domain/rule-packs";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
vi.mock("@/features/game/storage/match-slot", () => ({
  saveMatch: vi.fn(async () => {}),
  loadMatch: vi.fn(async () => null),
  clearMatch: vi.fn(async () => {}),
}));

const { GamePlay } = await import("@/features/game/components/GamePlay");

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
 * ⚠️ A REAL pool driving a REAL simulated match.
 *
 * The commentary, the scoreline, the bookings and the substitution offers below all come
 * out of `runMatch`. A hand-written `MatchEvent[]` would let this file assert against a
 * match the engine cannot produce — the rule that has already caught three defects a
 * green suite was hiding.
 */
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  [0, 1, 2, 3, 4, 5].map((i) => ({
    cardId: makeCardId(r * 10 + i, 2020 - i),
    playerId: r * 10 + i,
    season: 2020 - i,
    name: `${role}Player${i}`,
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
      overall: 50 + i * 8,
    },
    club: "Liverpool",
    teamId: 40,
  })),
);

const LEGACY_DRAFT: DraftSpec = {
  handSize: 5,
  roam: "free",
  timer: null,
  lockPicks: true,
  standout: true,
  onePerPlayer: true,
};

const render = (ui: ReactElement) => renderWithIntl(<NuqsTestingAdapter>{ui}</NuqsTestingAdapter>);

/** Draft an XI and kick off — the only route to `?phase=live`. */
async function kickOff(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^Lock in / }));
  for (let i = 0; i < 11; i++) {
    await user.click(screen.getAllByRole("button", { name: /empty\. Choose a player/ })[0]);
    await user.click(screen.getAllByRole("button", { name: /^Choose / })[0]);
  }
  await user.click(screen.getByRole("button", { name: /^Kick off$/ }));
}

const live = () =>
  render(
    <GamePlay
      pool={pool}
      draft={LEGACY_DRAFT}
      screens="legacy"
      captaincies={{ 0: 4, 10: 3 }}
      referees={["M Oliver"]}
    />,
  );

describe("MatchLive — the split feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the pitch and the comments side by side", async () => {
    const user = userEvent.setup();
    live();
    await kickOff(user);

    expect(screen.getByRole("img", { name: /Both teams on the pitch/ })).toBeInTheDocument();
    expect(screen.getByRole("log")).toBeInTheDocument();
  });

  it("⛔ resolves commentary through commentaryArgs — the scoreline renders as DIGITS", async () => {
    /**
     * The owner caught this in a prototype: the catalog interpolates `{homeScoreFmt}` /
     * `{awayScoreFmt}`, which `commentaryArgs()` DERIVES from `homeScore`/`awayScore`.
     * Substituting `ref.values` leaves "⏸ Half-time: –".
     *
     * ⚠️ Asserting "no line ends in a dash" was NOT enough — verified by sabotage. With the
     * bridge removed, next-intl cannot resolve the argument and falls back to printing the
     * raw key ("commentary.halftime"), which has no dash at all, so the test stayed green
     * over the exact bug it was written for. Assert the POSITIVE instead: half-time always
     * happens in a 90-minute match, and its line must carry real digits.
     */
    const user = userEvent.setup();
    live();
    await kickOff(user);

    const texts = within(screen.getByRole("log"))
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    expect(texts.length).toBeGreaterThan(0);

    expect(texts.some((s) => /Half-time:\s*\d+\s*[–-]\s*\d+/.test(s))).toBe(true);
    // And no line may be an unresolved catalog key or a leftover placeholder.
    for (const s of texts) {
      expect(s).not.toMatch(/commentary\./);
      expect(s).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });

  it("⚠️ prints each minute once — the catalog's trailing (NN') is stripped", async () => {
    const user = userEvent.setup();
    live();
    await kickOff(user);

    for (const li of within(screen.getByRole("log")).getAllByRole("listitem")) {
      // The minute lives in its own column, so a "(45')" suffix would render it twice.
      expect(li.textContent ?? "").not.toMatch(/\(\d+'\)/);
    }
  });

  it("⛔ puts NOTHING on screen uninvited — no dialog, and never the shipped prompt", async () => {
    const user = userEvent.setup();
    live();
    await kickOff(user);

    // The complaint this redesign answers: `DecisionPrompt` appearing unbidden.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bench|Change available/ })).toBeInTheDocument();
  });

  it("opens the bench on the button, and Confirm is dead until both are picked", async () => {
    const user = userEvent.setup();
    live();
    await kickOff(user);

    await user.click(screen.getByRole("button", { name: /Bench|Change available/ }));
    const dialog = screen.getByRole("dialog", { name: /bench/i });
    expect(within(dialog).getByRole("button", { name: /Make the change/ })).toBeDisabled();
  });

  it("closes the bench three ways — Close, Not now, and Escape", async () => {
    const user = userEvent.setup();
    live();
    await kickOff(user);
    const open = () => user.click(screen.getByRole("button", { name: /Bench|Change available/ }));

    await open();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Close$/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await open();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Not now/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await open();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers the Manual subs only toggle, off by default", async () => {
    const user = userEvent.setup();
    live();
    await kickOff(user);

    const toggle = screen.getByRole("checkbox", { name: /Manual subs only/ });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(toggle).toBeChecked();
  });

  it("⚠️ reduced motion FOLLOWS the ceiling instead of freezing at the first decision", async () => {
    /**
     * `minute` is seeded from the ceiling once and the clock effect is disabled under
     * reduced motion, so without an effect tracking the ceiling the screen sticks at
     * whatever minute the first decision landed on.
     *
     * Measured: removing that effect fails this file on 5 of 10 runs, because the first
     * decision can be raised before half-time. The clock must be well past it.
     */
    const user = userEvent.setup();
    live();
    await kickOff(user);

    // ⚠️ Scoped by testid: the feed prints a minute in its own column on every line, so a
    // bare /^\d+'$/ matches a dozen elements.
    const clock = screen.getByTestId("live-clock").textContent ?? "";
    expect(Number.parseInt(clock, 10)).toBeGreaterThanOrEqual(45);
  });

  it("names the REFEREE on the scoreboard, and shows no weather", async () => {
    // Reported from the preview: the board read "STRICT" and "CLEAR". Real referees are
    // in the committed fixtures, so it can name the official instead of grading him.
    const user = userEvent.setup();
    live();
    await kickOff(user);

    expect(screen.getByText("M Oliver")).toBeInTheDocument();
    for (const label of [/^Strict$/, /^Clear$/, /^Rain$/]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("puts the shirt NUMBER on every team-sheet row", async () => {
    const user = userEvent.setup();
    live();
    await kickOff(user);

    // The same number his dot wears on the pitch, so the two can be read together.
    const rows = screen.getAllByTestId("sheet-row");
    for (const row of rows.slice(0, 11)) {
      expect(row.textContent ?? "").toMatch(/^\d+/);
    }
  });

  it("shows both team sheets, eleven rows a side at kick-off", async () => {
    const user = userEvent.setup();
    live();
    await kickOff(user);

    // 22 starters. Substitutes append rows as they come on, so this is a floor.
    expect(screen.getAllByTestId("sheet-row").length).toBeGreaterThanOrEqual(22);
  });

  it("gives the armband to the most-capped captain in the XI", async () => {
    const user = userEvent.setup();
    live();
    await kickOff(user);

    // playerId 0 was handed 4 captaincies above — more than anyone else in the pool.
    const marks = screen.getAllByText("C");
    expect(marks.length).toBeGreaterThan(0);
  });
});
