import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";

import { PlayerHero } from "@/features/players/components/PlayerHero";
import type { PlayerProfile } from "@/features/players/api";
import type { ComparisonMetrics } from "@/types/api";

import { renderWithIntl } from "./_helpers/intl";

function metrics(): ComparisonMetrics {
  return {
    appearances: null,
    goals: null,
    assists: null,
    passAccuracy: null,
    keyPasses: null,
    tackles: null,
    interceptions: null,
    duelsWon: null,
    dribblesCompleted: null,
    shotsOnTarget: null,
    yellowCards: null,
    redCards: null,
  };
}

const SALAH: PlayerProfile = {
  id: 1000334,
  name: "Mohamed Salah",
  team: { id: 40, name: "Liverpool", logo: "/logos/40.png" },
  position: "Forward",
  photo: "118748",
  age: null,
  birthDate: null,
  dateOfDeath: null,
  nationality: null,
  nationalityCode: null,
  isCaptain: false,
  role: null,
  altRoles: [],
  foot: null,
  height: null,
  metrics: metrics(),
};

// TASK-M70: an enriched profile — drives the role block instead of the plain
// position line.
const SALAH_ROLE: PlayerProfile = {
  ...SALAH,
  role: "CF",
  altRoles: ["SS", "RW"],
  foot: "left",
  height: 175,
};

afterEach(cleanup);

describe("PlayerHero", () => {
  it("renders the name as the page h1 and the position", () => {
    renderWithIntl(<PlayerHero season={2024} player={SALAH} />);
    expect(screen.getByRole("heading", { level: 1, name: "Mohamed Salah" })).toBeInTheDocument();
    expect(screen.getByText("Forward")).toBeInTheDocument();
  });

  it("renders the enriched role block (role code, alt-roles, foot, height) when role is set", () => {
    renderWithIntl(<PlayerHero season={2024} player={SALAH_ROLE} />);
    expect(screen.getByText("CF")).toBeInTheDocument(); // role monogram
    expect(screen.getByRole("img", { name: "Centre-Forward" })).toBeInTheDocument(); // mini-pitch a11y
    expect(screen.getByText(/SS · RW/)).toBeInTheDocument(); // alt roles
    expect(screen.getByText(/Left/)).toBeInTheDocument(); // preferred foot
    expect(screen.getByText("175 cm")).toBeInTheDocument(); // height
  });

  it("links the team to /teams/{id}", () => {
    renderWithIntl(<PlayerHero season={2024} player={SALAH} />);
    expect(screen.getByRole("link", { name: /view liverpool page/i })).toHaveAttribute(
      "href",
      "/teams/40?season=2024",
    );
  });

  it("links the Compare CTA to /compare?a=<id>&sa=<season> so slot A keeps the viewed season", () => {
    renderWithIntl(<PlayerHero season={2007} player={SALAH} />);
    // The slot-A season (`sa`) must travel with the id — otherwise compare
    // resolves the player against its default season, 404s, and self-heals
    // the slot empty (TASK-M24 per-slot season; the M25-era fix).
    expect(screen.getByRole("link", { name: /compare with another player/i })).toHaveAttribute(
      "href",
      "/compare?a=1000334&sa=2007",
    );
  });

  it("renders the player's CDN photo when the photo is an FPL code", () => {
    const { container } = renderWithIntl(<PlayerHero season={2024} player={SALAH} />);
    expect(container.querySelector('img[src*="/110x140/118748.png"]')).not.toBeNull();
  });
});

describe("PlayerHero bio line (TASK-M15)", () => {
  const WITH_BIO: PlayerProfile = {
    ...SALAH,
    age: 33,
    birthDate: "1992-06-15",
    nationality: "Egypt",
    nationalityCode: "eg",
  };

  it("shows nationality, a (live) age, and DOB", () => {
    const { getByRole, getByText, container } = renderWithIntl(
      <PlayerHero season={2025} player={WITH_BIO} />,
    );
    expect(getByRole("img", { name: "Egypt" })).toBeTruthy();
    expect(getByText("Egypt")).toBeInTheDocument();
    expect(container.textContent).toMatch(/Age \d+/);
    expect(getByText(/Born 15\/06\/1992/)).toBeInTheDocument();
  });

  it("omits the bio line entirely when nothing is known", () => {
    const { queryByText } = renderWithIntl(<PlayerHero season={2025} player={SALAH} />);
    expect(queryByText(/Age/)).toBeNull();
    expect(queryByText(/Born/)).toBeNull();
  });

  it("renders the captain badge next to the name when captain (TASK-M41)", () => {
    const { getByRole, queryByRole, rerender } = renderWithIntl(
      <PlayerHero season={2024} player={{ ...SALAH, isCaptain: true }} />,
    );
    expect(getByRole("img", { name: "Club captain" })).toBeTruthy();
    rerender(<PlayerHero season={2024} player={SALAH} />);
    expect(queryByRole("img", { name: "Club captain" })).toBeNull();
  });

  it("shows the deceased treatment: Died line, frozen age, mourning ribbon (TASK-M40)", () => {
    const jota: PlayerProfile = {
      ...SALAH,
      name: "Diogo Jota",
      age: 28,
      birthDate: "1996-12-04",
      dateOfDeath: "2025-07-03",
      nationality: "Portugal",
      nationalityCode: "pt",
    };
    const { getByText, container } = renderWithIntl(<PlayerHero season={2024} player={jota} />);
    expect(getByText(/Died 03\/07\/2025/)).toBeInTheDocument();
    expect(getByText(/Age 28/)).toBeInTheDocument(); // frozen at death
    expect(container.querySelector('[data-testid="mourning-ribbon"]')).not.toBeNull();
  });
});
