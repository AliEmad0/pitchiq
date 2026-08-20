import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClubCrest } from "@/features/game/components/ClubCrest";
import { MatchSummary } from "@/features/game/components/MatchSummary";
import { renderWithIntl } from "./_helpers/intl";

/**
 * Owner, 2026-08-20: the setup picker, the live scoreboard and the full-time screen all
 * named a club and showed nothing but the name.
 */

const summary = (crests?: { home: number | null; away: number | null }) =>
  renderWithIntl(
    <MatchSummary
      homeName="Your XI"
      awayName="Chelsea"
      score={{ home: 1, away: 4 }}
      decisions={[]}
      seed={1}
      shareCode={null}
      cardData={null}
      locale="en"
      crests={crests}
      onNewMatch={vi.fn()}
    />,
  );

describe("ClubCrest", () => {
  it("resolves the club's committed crest file", () => {
    const { container } = renderWithIntl(<ClubCrest teamId={40} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/logos/40.png");
  });

  it("⛔ renders NOTHING for an unknown club, rather than a broken image", () => {
    // The away id is null whenever the coach faces his own club's pool — the mode's
    // behaviour before a rival could be picked, and still the fallback when the fetch fails.
    const { container } = renderWithIntl(<ClubCrest teamId={null} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("⛔ removes itself when the file 404s", () => {
    /**
     * `/logos/<id>.png` covers all 51 Premier League clubs today, but the id comes from
     * whatever the data carries. A missing file must degrade to the bare name — which is
     * exactly what these screens showed before crests existed — never to a broken-image
     * glyph beside the scoreline.
     */
    const { container } = renderWithIntl(<ClubCrest teamId={999999} />);
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
  });

  it("⚠️ is decorative — the club's NAME is always beside it", () => {
    // With an alt text a screen reader would announce the same club twice.
    const { container } = renderWithIntl(<ClubCrest teamId={40} />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("aria-hidden", "true");
  });
});

describe("MatchSummary — crests", () => {
  it("shows one for each side", () => {
    const { container } = summary({ home: 40, away: 8 });
    const srcs = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(srcs).toEqual(["/logos/40.png", "/logos/8.png"]);
  });

  it("keeps both NAMES readable alongside them", () => {
    summary({ home: 40, away: 8 });
    expect(screen.getByText("Your XI")).toBeInTheDocument();
    expect(screen.getByText("Chelsea")).toBeInTheDocument();
  });

  it("⚠️ the shipped packs pass none and are unchanged", () => {
    const { container } = summary();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByText("Chelsea")).toBeInTheDocument();
  });
});
