import "fake-indexeddb/auto";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dayKey } from "@/features/game/domain/daily";
import { saveDaily } from "@/features/game/storage/daily-slot";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const pathname = vi.hoisted(() => ({ current: "/players" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

const { DailyBubble } = await import("@/features/game/components/DailyBubble");

const today = () => dayKey(new Date());

const finished = (day: string) =>
  saveDaily({
    day,
    cardIds: [],
    answers: [],
    fingerprint: 1,
    eventCount: 1,
    done: true,
    score: { home: 2, away: 0 },
  });

describe("DailyBubble", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("pitchiq-game");
    sessionStorage.clear();
    pathname.current = "/players";
  });

  it("links to the daily challenge from an ordinary page", async () => {
    renderWithIntl(<DailyBubble />);
    const link = await screen.findByTestId("daily-bubble");
    expect(link).toHaveAttribute("href", "/game/daily");
  });

  it("⚠️ renders NOTHING on the first paint, before storage answers", () => {
    // Every route is force-static. A bubble that rendered its played/unplayed state
    // during render would bake one visitor's state into the CDN copy.
    const { container } = renderWithIntl(<DailyBubble />);
    expect(container.querySelector("[data-testid=daily-bubble]")).toBeNull();
  });

  it("shows the nudge dot while today is unplayed", async () => {
    renderWithIntl(<DailyBubble />);
    await screen.findByTestId("daily-bubble");
    expect(screen.queryByTestId("daily-bubble-dot")).not.toBeNull();
  });

  it("⛔ drops the dot once today is played", async () => {
    await finished(today());
    renderWithIntl(<DailyBubble />);
    await screen.findByTestId("daily-bubble");
    expect(screen.queryByTestId("daily-bubble-dot")).toBeNull();
  });

  it("⚠️ yesterday's result does not clear today's dot", async () => {
    await finished("1999-01-01");
    renderWithIntl(<DailyBubble />);
    await screen.findByTestId("daily-bubble");
    expect(screen.queryByTestId("daily-bubble-dot")).not.toBeNull();
  });

  it("⛔ hides itself on the daily challenge page", async () => {
    pathname.current = "/game/daily";
    const { container } = renderWithIntl(<DailyBubble />);
    // Give the effect a chance to run; it must stay absent regardless.
    await waitFor(() => expect(container.querySelector("[data-testid=daily-bubble]")).toBeNull());
  });

  it("carries the locale prefix in Arabic, and an accessible name", async () => {
    renderWithIntl(<DailyBubble />, "ar");
    const link = await screen.findByTestId("daily-bubble");
    expect(link).toHaveAttribute("href", "/ar/game/daily");
    // A bare emoji bubble would be unreachable by name for a screen reader.
    expect(link.getAttribute("aria-label")).toBeTruthy();
  });
});
