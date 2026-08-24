import "fake-indexeddb/auto";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { dayFormation, dayKey, dayNumber } from "@/features/game/domain/daily";
import { saveDaily } from "@/features/game/storage/daily-slot";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

// ⚠️ Dynamic import AFTER the mock, matching game-draft-room-view.test.tsx — the
// container reaches `prefersReducedMotion` through `DraftRoom`.
const { DailyChallenge } = await import("@/features/game/components/DailyChallenge");

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
 * A pool deep enough for any of the twenty shapes to fill, since the day picks the shape
 * and these tests must not care which day they run on.
 */
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

const mount = () => renderWithIntl(<DailyChallenge pool={pool} />);

/** The same UTC day the component will resolve. Never a hardcoded date. */
const today = () => dayKey(new Date());

describe("DailyChallenge", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("pitchiq-game");
    sessionStorage.clear();
  });

  it("⚠️ renders no day-specific content before mount resolves the day", () => {
    // The route is force-static and CDN-cached; baking today's number into the
    // prerender would serve a stale challenge tomorrow.
    //
    // ⚠️ Asserts the SHELL IS EMPTY rather than "no #N on screen". TASK-1836's hub shows
    // the day as a bare figure under a DAY label, so a pattern match on the old "#7"
    // format would now pass no matter what the shell rendered — a vacuous guard on the
    // one thing this test exists to catch.
    const { container } = mount();
    expect(container.querySelector("[data-testid=daily-loading]")).not.toBeNull();
    expect(container.querySelector("[data-testid=daily-header]")).toBeNull();
    expect(container.textContent?.trim()).toBe("");
  });

  it("shows today's challenge number and shape after mount", async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId("daily-header")).toBeTruthy());
    // The real number for the real day — never a hardcoded one.
    expect(screen.getByTestId("daily-day")).toHaveTextContent(String(dayNumber(today())));
    // The shape now leads the Gazette rather than the title.
    expect(screen.getByText(new RegExp(dayFormation(today()).name))).toBeInTheDocument();
  });

  it("⛔ renders a finished day as spent rather than offering a fresh attempt", async () => {
    await saveDaily({
      day: today(),
      cardIds: [],
      answers: [],
      fingerprint: 1,
      eventCount: 1,
      done: true,
      score: { home: 2, away: 0 },
    });
    mount();
    await waitFor(() => expect(screen.getByTestId("daily-spent")).toBeTruthy());
  });

  it("⚠️ a session marker with NO record still renders the day spent", async () => {
    // Storage was cleared mid-challenge. This is the tamper speed bump; without it
    // the day would silently offer a fresh attempt.
    sessionStorage.setItem(`daily_active_lock_${today()}`, "1");
    mount();
    await waitFor(() => expect(screen.getByTestId("daily-spent")).toBeTruthy());
  });

  it("⚠️ a marker for a DIFFERENT day does not lock today", async () => {
    sessionStorage.setItem("daily_active_lock_1999-01-01", "1");
    mount();
    await waitFor(() => expect(screen.getByTestId("daily-header")).toBeTruthy());
    expect(screen.queryByTestId("daily-spent")).toBeNull();
  });

  it("⛔ KICKOFF spends the day — writes the record and the marker", async () => {
    // ⚠️ This is the test that had to exist. The marker assertions above set
    // sessionStorage by hand, so they prove `wasStarted` READS a marker and say nothing
    // about anything WRITING one — commenting out `markStarted` left all of them green.
    // Verified by doing exactly that: this is the only test that goes red without it.
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(screen.getByTestId("daily-header")).toBeTruthy());

    // TASK-1836: picking happens in a full-screen overlay the coach opens himself.
    await user.click(screen.getByRole("button", { name: /Start picking/ }));

    // Drafting is free and spends nothing — fill all eleven slots.
    for (let i = 0; i < 11; i++) {
      const cards = screen.queryAllByRole("button", { name: /rated \d+$/ });
      if (cards.length === 0) break;
      await user.click(cards[0]!);
    }

    // Still nothing spent: the commit point is kickoff, not the draft.
    expect(sessionStorage.getItem(`daily_active_lock_${today()}`)).toBeNull();

    const kick = await screen.findByRole("button", { name: /kick.?off/i });
    await user.click(kick);

    await waitFor(() => expect(sessionStorage.getItem(`daily_active_lock_${today()}`)).toBe("1"));
  });

  it("⚠️ an EARLIER day's finished record does not spend today", async () => {
    await saveDaily({
      day: "1999-01-01",
      cardIds: [],
      answers: [],
      fingerprint: 1,
      eventCount: 1,
      done: true,
      score: { home: 3, away: 0 },
    });
    mount();
    await waitFor(() => expect(screen.getByTestId("daily-header")).toBeTruthy());
    expect(screen.queryByTestId("daily-spent")).toBeNull();
  });
});
