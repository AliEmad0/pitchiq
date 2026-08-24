import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { renderWithIntl } from "./_helpers/intl";

// Reduced motion → no deal-in timers; the draft renders settled.
vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { ChaosDraft } = await import("@/features/game/components/ChaosDraft");

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

// Many cards per role so different seeds really can draft different names.
const pool: EnrichedCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 12 }, (_, i) => {
    const id = r * 100 + i;
    return {
      cardId: `${id}@2020` as const,
      playerId: id,
      season: 2020,
      name: `${role} Player${i}`,
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
      club: `Club ${r}`,
      photo: null,
      photoKind: "none" as const,
      photoUrl: null,
      age: 25,
      nationality: null,
      nationalityCode: null,
      careerClubs: [],
      stats: {
        goals: 0,
        assists: 0,
        appearances: 0,
        cleanSheets: 0,
        yellowCards: 0,
        redCards: 0,
      },
    };
  }),
);

/** The set of drafted player names currently on screen. */
function draftedNames(): string[] {
  return screen
    .getAllByText(/Player\d+/)
    .map((el) => el.textContent ?? "")
    .filter(Boolean);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ChaosDraft entropy", () => {
  it("drafts a different XI for each visitor rather than one fixed lineup", () => {
    // Two independent visitors — distinct entropy, so distinct drafts.
    vi.spyOn(Math, "random").mockReturnValue(0.11);
    const first = renderWithIntl(<ChaosDraft pool={pool} onConfirm={() => {}} />);
    const a = draftedNames();
    first.unmount();

    vi.spyOn(Math, "random").mockReturnValue(0.87);
    renderWithIntl(<ChaosDraft pool={pool} onConfirm={() => {}} />);
    const b = draftedNames();

    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(b).not.toEqual(a);
  });

  it("draws fresh entropy for the draft instead of stepping a fixed sequence", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.42);
    renderWithIntl(<ChaosDraft pool={pool} onConfirm={() => {}} />);
    expect(random).toHaveBeenCalled();
  });
});

describe("Match Night (TASK-1835)", () => {
  it("shows the versus board carrying both averages and both shapes", () => {
    renderWithIntl(<ChaosDraft pool={pool} onConfirm={() => {}} />);
    const board = screen.getByRole("group", { name: "Matchday board" });
    expect(board.querySelectorAll(".mn-board-num")).toHaveLength(2);
    expect(board.querySelectorAll(".mn-tag")).toHaveLength(2);
  });

  it("puts both formations on one pitch, a rating on every dot", () => {
    renderWithIntl(<ChaosDraft pool={pool} onConfirm={() => {}} />);
    expect(document.querySelectorAll(".mn-dot-home")).toHaveLength(11);
    expect(document.querySelectorAll(".mn-dot-away")).toHaveLength(11);
    for (const dot of document.querySelectorAll(".mn-dot")) {
      expect(dot.querySelector("b")?.textContent).toMatch(/^\d+$/);
    }
  });

  it("deals both squads face to face, each card over its real back", () => {
    renderWithIntl(<ChaosDraft pool={pool} onConfirm={() => {}} />);
    // 22 cards, every one carrying a back face for the flip reveal.
    expect(document.querySelectorAll(".mn-card")).toHaveLength(22);
    expect(document.querySelectorAll(".mn-card-backside")).toHaveLength(22);
    expect(screen.getByRole("button", { name: /Play Match/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Re-roll/ })).toBeInTheDocument();
  });
});
