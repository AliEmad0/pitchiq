import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

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

async function reachPreview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Auto-fill" }));
  await user.click(screen.getByRole("button", { name: "Play match" }));
}

describe("GamePlay", () => {
  it("starts on the draft hub", () => {
    renderWithIntl(<GamePlay pool={pool} />);
    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeInTheDocument();
  });

  it("a confirmed squad reaches the PREVIEW, not the match", async () => {
    // The draft used to mount the match directly; the container owns that now.
    const user = userEvent.setup();
    renderWithIntl(<GamePlay pool={pool} />);
    await reachPreview(user);
    expect(screen.getByText("Before kick-off")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kick off" })).toBeInTheDocument();
  });

  it("⚠️ the preview names the referee and weather the match will actually use", async () => {
    // Read from the first segment's events, never recomputed — they are the first two
    // draws inside runMatch, so a separate draw would name a different official.
    const user = userEvent.setup();
    renderWithIntl(<GamePlay pool={pool} />);
    await reachPreview(user);
    const refereeCell = screen.getByText("Referee").closest("div");
    const weatherCell = screen.getByText("Conditions").closest("div");
    expect(refereeCell!.textContent).not.toMatch(/—/);
    expect(weatherCell!.textContent).not.toMatch(/—/);
  });

  it("kick-off reaches the live broadcast", async () => {
    const user = userEvent.setup();
    renderWithIntl(<GamePlay pool={pool} />);
    await reachPreview(user);
    await user.click(screen.getByRole("button", { name: "Kick off" }));
    expect(screen.getByRole("group", { name: /Live scoreboard/i })).toBeInTheDocument();
  });

  it("going back from the preview returns to an empty draft", async () => {
    const user = userEvent.setup();
    renderWithIntl(<GamePlay pool={pool} />);
    await reachPreview(user);
    await user.click(screen.getByRole("button", { name: "Change the squad" }));
    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play match" })).toBeDisabled();
  });

  it("can be deep-linked straight into a phase", () => {
    // /game/draft and /game/play mount the same container; only the entry phase differs.
    renderWithIntl(<GamePlay pool={pool} initialPhase="setup" />);
    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeInTheDocument();
  });
});
