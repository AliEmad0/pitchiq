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
    const first = renderWithIntl(<ChaosDraft pool={pool} locale="en" />);
    const a = draftedNames();
    first.unmount();

    vi.spyOn(Math, "random").mockReturnValue(0.87);
    renderWithIntl(<ChaosDraft pool={pool} locale="en" />);
    const b = draftedNames();

    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(b).not.toEqual(a);
  });

  it("draws fresh entropy for the draft instead of stepping a fixed sequence", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.42);
    renderWithIntl(<ChaosDraft pool={pool} locale="en" />);
    expect(random).toHaveBeenCalled();
  });
});
