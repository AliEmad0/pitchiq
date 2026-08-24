import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { renderWithIntl } from "./_helpers/intl";

// Motion ON — this is the path that shows the generating bar.
vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => false }));

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

const pool: EnrichedCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 6 }, (_, i) => {
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

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Chaos draft generating state", () => {
  it("shows a generating indicator before any squad, so no placeholder XI is ever seen", () => {
    renderWithIntl(<ChaosDraft pool={pool} onConfirm={() => {}} />);
    expect(screen.getByRole("progressbar")).toBeTruthy();
    // The whole point: the user must NOT see a lineup that is about to be replaced.
    expect(screen.queryByText(/Player\d+/)).toBeNull();
  });

  it("reveals the drafted XI once generating finishes", () => {
    renderWithIntl(<ChaosDraft pool={pool} onConfirm={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getAllByText(/Player\d+/).length).toBeGreaterThan(0);
  });

  it("generates a different squad per visitor", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.13);
    const first = renderWithIntl(<ChaosDraft pool={pool} onConfirm={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const a = screen.getAllByText(/Player\d+/).map((el) => el.textContent);
    first.unmount();

    vi.spyOn(Math, "random").mockReturnValue(0.86);
    renderWithIntl(<ChaosDraft pool={pool} onConfirm={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getAllByText(/Player\d+/).map((el) => el.textContent)).not.toEqual(a);
  });
});
