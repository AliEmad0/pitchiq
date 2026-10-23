import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import { chaosMatchup, type PoolCard } from "@/features/game/domain/chaos-draft";
import {
  offPositionSlots,
  teamFitChemistry,
  type Fittable,
} from "@/features/game/domain/chemistry";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { DraftScreen } = await import("@/features/game/components/DraftScreen");

/**
 * TASK-1824 remainder — chemistry on the Chaos versus board. ⛔ The board must show the figure
 * the ENGINE plays: `buildSession` re-runs `chaosMatchup` from the same seed and scores both XIs
 * with `fitChemistry`, so the board is checked against `teamFitChemistry` of those two teams.
 * No right-backs in the pool: a centre-back covering RB is out of position by construction.
 */
const ROLES: PlayerRole[] = [
  "GK",
  "LB",
  "CB",
  "LM",
  "CM",
  "RM",
  "CDM",
  "CAM",
  "LW",
  "RW",
  "SS",
  "CF",
];
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 10 }, (_, i) => ({
    cardId: makeCardId(r * 100 + i, 2010 + (i % 3)),
    playerId: r * 100 + i,
    season: 2010 + (i % 3),
    name: `${role} P${i}`,
    role,
    altRoles: (role === "CB" ? ["RB"] : []) as PlayerRole[],
    foot: null,
    height: null,
    provenance: null,
    ratings: {
      attack: 60,
      creation: 60,
      defense: 60,
      physical: 60,
      discipline: 60,
      overall: 60 + i,
    },
    club: `Club ${i % 4}`,
    teamId: 10 + (i % 4),
    nationalityCode: i % 2 === 0 ? "fr" : "es",
  })),
);
const m = chaosMatchup(pool, 4242, { home: "Your XI", away: "Rivals" });
const away = m.opponent.kind === "squad" ? m.opponent.team : m.home;
const noop = () => {};

describe("chemistry on the Chaos board", () => {
  it("⭐ shows BOTH sides' chemistry — the same figure the engine plays", () => {
    renderWithIntl(
      <DraftScreen
        home={m.home}
        opponent={away}
        exiting={false}
        reduced
        chemistry
        onReroll={noop}
        onPlay={noop}
      />,
    );
    expect(screen.getByTestId("mn-chem-home")).toHaveTextContent(
      `Chemistry ${teamFitChemistry(m.home)}`,
    );
    expect(screen.getByTestId("mn-chem-away")).toHaveTextContent(
      `Chemistry ${teamFitChemistry(away)}`,
    );
  });

  it("⭐ marks every man out of his own position, on both sides", () => {
    renderWithIntl(
      <DraftScreen
        home={m.home}
        opponent={away}
        exiting={false}
        reduced
        chemistry
        onReroll={noop}
        onPlay={noop}
      />,
    );
    const expected =
      offPositionSlots(m.home.players as readonly Fittable[], m.home.formation).length +
      offPositionSlots(away.players as readonly Fittable[], away.formation).length;
    expect(expected).toBeGreaterThan(0);
    expect(screen.getAllByTestId("chem-off")).toHaveLength(expected);
  });

  it("⛔ THE CONTROL — without the prop the board is unchanged", () => {
    renderWithIntl(
      <DraftScreen
        home={m.home}
        opponent={away}
        exiting={false}
        reduced
        onReroll={noop}
        onPlay={noop}
      />,
    );
    for (const id of ["mn-chem-home", "mn-chem-away", "chem-off"]) {
      expect(screen.queryAllByTestId(id)).toHaveLength(0);
    }
  });
});
