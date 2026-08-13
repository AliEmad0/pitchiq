import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

/**
 * An in-memory stand-in for the IndexedDB slot.
 *
 * The real store is exercised in game-idb / game-match-slot; here what matters is WHEN
 * the container reads and writes, not that IndexedDB works.
 */
const slot = {
  saved: null as unknown,
  save: vi.fn(async (m: unknown) => {
    slot.saved = m;
  }),
  load: vi.fn(async () => slot.saved),
  clear: vi.fn(async () => {
    slot.saved = null;
  }),
};

vi.mock("@/features/game/storage/match-slot", () => ({
  saveMatch: (m: unknown) => slot.save(m),
  loadMatch: () => slot.load(),
  clearMatch: () => slot.clear(),
}));

const { GamePlay } = await import("@/features/game/components/GamePlay");

const ROLES: PlayerRole[] = [
  "GK",
  "LB",
  "CB",
  "RB",
  "LM",
  "CM",
  "RM",
  "CDM",
  "CAM",
  "LW",
  "RW",
  "CF",
];
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  [0, 1, 2, 3].map((i) => ({
    cardId: makeCardId(1000 + r * 10 + i, 2020),
    playerId: 1000 + r * 10 + i,
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
      overall: 50,
    },
    club: "Club",
  })),
);

/**
 * `GamePlay` mirrors its phase into the URL, and `useQueryState` throws without an
 * adapter — so every render of it needs one.
 */
const renderPlay = (ui: ReactElement) =>
  renderWithIntl(<NuqsTestingAdapter>{ui}</NuqsTestingAdapter>);

async function reachPreview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Auto-fill" }));
  await user.click(screen.getByRole("button", { name: "Play match" }));
}

/** Draft, confirm, kick off — and wait for the match to have been written. */
async function playToLive(user: ReturnType<typeof userEvent.setup>) {
  await reachPreview(user);
  await user.click(screen.getByRole("button", { name: "Kick off" }));
  await vi.waitFor(() => expect(slot.saved).not.toBeNull());
}

describe("GamePlay", () => {
  beforeEach(() => {
    // Every test starts with nothing stored, or a match saved by an earlier test would
    // pop a resume dialog over an unrelated assertion.
    slot.saved = null;
    slot.save.mockClear();
    slot.load.mockClear();
    slot.clear.mockClear();
  });

  it("starts on the draft hub", () => {
    renderPlay(<GamePlay pool={pool} />);
    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeInTheDocument();
  });

  it("a confirmed squad reaches the PREVIEW, not the match", async () => {
    // The draft used to mount the match directly; the container owns that now.
    const user = userEvent.setup();
    renderPlay(<GamePlay pool={pool} />);
    await reachPreview(user);
    expect(screen.getByText("Before kick-off")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kick off" })).toBeInTheDocument();
  });

  it("⚠️ the preview names the referee and weather the match will actually use", async () => {
    // Read from the first segment's events, never recomputed — they are the first two
    // draws inside runMatch, so a separate draw would name a different official.
    const user = userEvent.setup();
    renderPlay(<GamePlay pool={pool} />);
    await reachPreview(user);
    const refereeCell = screen.getByText("Referee").closest("div");
    const weatherCell = screen.getByText("Conditions").closest("div");
    expect(refereeCell!.textContent).not.toMatch(/—/);
    expect(weatherCell!.textContent).not.toMatch(/—/);
  });

  it("kick-off reaches the live broadcast", async () => {
    const user = userEvent.setup();
    renderPlay(<GamePlay pool={pool} />);
    await reachPreview(user);
    await user.click(screen.getByRole("button", { name: "Kick off" }));
    expect(screen.getByRole("group", { name: /Live scoreboard/i })).toBeInTheDocument();
  });

  it("going back from the preview returns to an empty draft", async () => {
    const user = userEvent.setup();
    renderPlay(<GamePlay pool={pool} />);
    await reachPreview(user);
    await user.click(screen.getByRole("button", { name: "Change the squad" }));
    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play match" })).toBeDisabled();
  });

  it("can be deep-linked straight into a phase", () => {
    // The container is mounted by /game/draft alone since TASK-1832 retired /game/play;
    // `initialPhase` is what a future caller would vary.
    renderPlay(<GamePlay pool={pool} initialPhase="setup" />);
    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeInTheDocument();
  });

  it("saves the match once it is live", async () => {
    const user = userEvent.setup();
    renderPlay(<GamePlay pool={pool} initialPhase="setup" />);
    await playToLive(user);
    expect(slot.saved).toMatchObject({ cardIds: expect.any(Array), seed: expect.any(Number) });
  });

  it("⚠️ saves nothing before kick-off", async () => {
    // "Live match only" is a scope decision, not an accident. Saving at the preview
    // would offer a resume into a match that never started.
    const user = userEvent.setup();
    renderPlay(<GamePlay pool={pool} initialPhase="setup" />);
    await reachPreview(user);
    expect(slot.save).not.toHaveBeenCalled();
  });

  it("offers a stored match back", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPlay(<GamePlay pool={pool} initialPhase="setup" />);
    await playToLive(user);
    unmount();

    renderPlay(<GamePlay pool={pool} initialPhase="setup" />);
    expect(await screen.findByRole("dialog", { name: "Match in progress" })).toBeInTheDocument();
  });

  it("⚠️ the hub is rendered underneath, never replaced", async () => {
    // The PR #97 lesson: a force-static page must not visibly swap what it painted.
    const user = userEvent.setup();
    const { unmount } = renderPlay(<GamePlay pool={pool} initialPhase="setup" />);
    await playToLive(user);
    unmount();

    renderPlay(<GamePlay pool={pool} initialPhase="setup" />);
    await screen.findByRole("dialog", { name: "Match in progress" });
    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeInTheDocument();
  });

  it("resuming re-enters the live match", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPlay(<GamePlay pool={pool} initialPhase="setup" />);
    await playToLive(user);
    unmount();

    renderPlay(<GamePlay pool={pool} initialPhase="setup" />);
    await screen.findByRole("dialog", { name: "Match in progress" });
    await user.click(screen.getByRole("button", { name: "Resume match" }));
    expect(screen.getByRole("group", { name: /Live scoreboard/i })).toBeInTheDocument();
  });

  it("start over clears the slot and dismisses the dialog", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPlay(<GamePlay pool={pool} initialPhase="setup" />);
    await playToLive(user);
    unmount();

    renderPlay(<GamePlay pool={pool} initialPhase="setup" />);
    await screen.findByRole("dialog", { name: "Match in progress" });
    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(slot.clear).toHaveBeenCalled();
  });

  it("no dialog when nothing is stored", async () => {
    renderPlay(<GamePlay pool={pool} initialPhase="setup" />);
    await vi.waitFor(() => expect(slot.load).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mirrors the live phase into the URL", async () => {
    const onUrlUpdate = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <NuqsTestingAdapter onUrlUpdate={onUrlUpdate}>
        <GamePlay pool={pool} initialPhase="setup" />
      </NuqsTestingAdapter>,
    );
    await reachPreview(user);
    await vi.waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const last = onUrlUpdate.mock.calls.at(-1)![0];
    expect(last.queryString).toContain("phase=preview");
  });

  it("⚠️ never pushes a history entry", async () => {
    // Back/forward must not become a second driver of the state machine: Forward into
    // `live` would have to re-enter a running generator, and Back from `summary` would
    // have to reverse full time. The reducer ignores out-of-phase transitions precisely
    // so no such path exists.
    const onUrlUpdate = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <NuqsTestingAdapter onUrlUpdate={onUrlUpdate}>
        <GamePlay pool={pool} initialPhase="setup" />
      </NuqsTestingAdapter>,
    );
    await reachPreview(user);
    await vi.waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    for (const call of onUrlUpdate.mock.calls) {
      expect(call[0].options.history).toBe("replace");
    }
  });
});
