import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { PlayerCard } = await import("@/features/game/components/PlayerCard");

const card: EnrichedCard = {
  cardId: "1@2019" as const,
  playerId: 1,
  season: 2019,
  name: "Mohamed Salah",
  role: "RW",
  altRoles: [],
  foot: null,
  height: null,
  provenance: null,
  ratings: {
    attack: 98,
    creation: 79,
    defense: 12,
    physical: 31,
    discipline: 90,
    overall: 92,
  },
  club: "Liverpool",
  photo: null,
  photoKind: "none",
  photoUrl: null,
  age: 27,
  nationality: "Egypt",
  nationalityCode: "eg",
  careerClubs: ["Chelsea", "Liverpool"],
  stats: {
    goals: 19,
    assists: 10,
    appearances: 34,
    cleanSheets: 0,
    yellowCards: 1,
    redCards: 0,
  },
} as EnrichedCard;

/** Eastern-Arabic-Indic digits ٠١٢٣٤٥٦٧٨٩ — must never appear on a card. */
const EASTERN_DIGITS = /[٠-٩]/;
/** Arabic letters — must never appear in the card's visible text. */
const ARABIC_LETTERS = /[ء-ي]/;

describe("PlayerCard is English-only in every locale", () => {
  it("renders Western digits on the Arabic locale", () => {
    const { container } = renderWithIntl(<PlayerCard card={card} />, "ar");
    expect(container.textContent ?? "").not.toMatch(EASTERN_DIGITS);
    expect(screen.getAllByText("92").length).toBeGreaterThan(0);
  });

  it("renders no Arabic letters in the card's visible text", () => {
    const { container } = renderWithIntl(<PlayerCard card={card} />, "ar");
    expect(container.textContent ?? "").not.toMatch(ARABIC_LETTERS);
  });

  it("renders identically on en and ar", () => {
    const en = renderWithIntl(<PlayerCard card={card} />, "en");
    const enText = en.container.textContent;
    en.unmount();
    const ar = renderWithIntl(<PlayerCard card={card} />, "ar");
    expect(ar.container.textContent).toBe(enText);
  });

  it("forces LTR so English text is not reordered inside the RTL page", () => {
    const { container } = renderWithIntl(<PlayerCard card={card} />, "ar");
    expect(container.querySelector("[dir='ltr']")).toBeTruthy();
  });
});
