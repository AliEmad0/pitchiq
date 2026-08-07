import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { PlayerCard } = await import("@/features/game/components/PlayerCard");

const base = {
  cardId: "1@2019" as const,
  playerId: 1,
  season: 2019,
  altRoles: [],
  foot: null,
  height: null,
  provenance: null,
  club: "Liverpool",
  teamId: 14,
  photo: null,
  photoKind: "none" as const,
  photoUrl: null,
  age: 27,
  nationality: null,
  nationalityCode: null,
  careerClubs: [],
  stats: { goals: 0, assists: 0, appearances: 38, cleanSheets: 15, yellowCards: 1, redCards: 0 },
};

const keeper = {
  ...base,
  name: "Alisson Becker",
  role: "GK",
  ratings: {
    attack: 0,
    creation: 60,
    defense: 88,
    physical: 55,
    discipline: 90,
    overall: 87,
    gk: { reflexes: 91, handling: 96, kicking: 69, positioning: 84, command: 55 },
  },
} as unknown as EnrichedCard;

const outfielder = {
  ...base,
  name: "Virgil van Dijk",
  role: "CB",
  ratings: {
    attack: 34,
    creation: 51,
    defense: 89,
    physical: 77,
    discipline: 92,
    overall: 88,
  },
} as unknown as EnrichedCard;

describe("PlayerCard goalkeeper face", () => {
  it("shows goalkeeper labels, not the outfield ones", () => {
    renderWithIntl(<PlayerCard card={keeper} />);
    expect(screen.getByText("REF")).toBeTruthy();
    expect(screen.getByText("HAN")).toBeTruthy();
    expect(screen.getByText("KIC")).toBeTruthy();
    expect(screen.queryByText("ATT")).toBeNull();
  });

  it("renders the goalkeeper's own numbers", () => {
    renderWithIntl(<PlayerCard card={keeper} />);
    expect(screen.getByText("91")).toBeTruthy();
    expect(screen.getByText("96")).toBeTruthy();
  });

  it("renders a dash for an era with no value rather than a fabricated zero", () => {
    const preSaves = {
      ...keeper,
      ratings: { ...keeper.ratings, gk: { ...keeper.ratings!.gk!, reflexes: null } },
    } as unknown as EnrichedCard;
    renderWithIntl(<PlayerCard card={preSaves} />);
    expect(screen.getByText("–")).toBeTruthy();
    // A missing reflexes number must never read as "0" — that means "terrible".
    expect(screen.queryByText("0")).toBeNull();
  });

  it("leaves the outfield card unchanged", () => {
    renderWithIntl(<PlayerCard card={outfielder} />);
    expect(screen.getByText("ATT")).toBeTruthy();
    expect(screen.getByText("DIS")).toBeTruthy();
    expect(screen.queryByText("REF")).toBeNull();
  });
});
