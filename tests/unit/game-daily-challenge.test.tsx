import "fake-indexeddb/auto";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { dayKey } from "@/features/game/domain/daily";
import { saveDaily } from "@/features/game/storage/daily-slot";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

// ⚠️ Dynamic import AFTER the mock, matching game-draft-room-view.test.tsx — the
// container reaches `prefersReducedMotion` through `DraftRoom`.
const { DailyChallenge } = await import("@/features/game/components/DailyChallenge");

// An empty pool is legitimate here: `roomDeals` returns empty hands and nothing
// crashes. These tests are about the day/lock lifecycle, not about drafting.
const pool: PoolCard[] = [];

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
    const { container } = mount();
    expect(container.querySelector("[data-testid=daily-loading]")).not.toBeNull();
    expect(container.textContent).not.toMatch(/#\d/);
  });

  it("shows today's challenge number and shape after mount", async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId("daily-header")).toBeTruthy());
    expect(screen.getByTestId("daily-header").textContent).toMatch(/#\d+/);
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
