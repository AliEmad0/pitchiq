import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DecisionAnswer } from "@/features/game/domain/match-decisions";
import { MatchSummary } from "@/features/game/components/MatchSummary";
import { renderWithIntl } from "./_helpers/intl";

/**
 * TASK-1810 — the full-time screen must report what the COACH did, not what the engine
 * did for him.
 *
 * Reported from the preview: five "Substitution" rows in a match the coach never touched.
 * Auto mode answers an offer with the engine's own recommendation, and those answers are
 * indistinguishable from his once they are in the replay stream.
 */
const sub = (minute: number, off?: number): DecisionAnswer => ({
  kind: "sub-offer",
  minute,
  side: "home",
  off,
  on: off == null ? undefined : off + 1,
});

const base = {
  homeName: "Your XI",
  awayName: "Rivals",
  score: { home: 1, away: 0 },
  seed: 42,
  shareCode: null,
  cardData: null,
  locale: "en",
  onNewMatch: vi.fn(),
};

describe("MatchSummary — decisions", () => {
  it("⛔ hides the section entirely when the coach took none", () => {
    // Not "no decisions" text — nothing at all. A heading over an empty list is noise.
    renderWithIntl(<MatchSummary {...base} decisions={[sub(60, 3), sub(70, 5)]} coachMoves={[]} />);
    expect(screen.queryByText(/Decisions you took/i)).not.toBeInTheDocument();
  });

  it("⭐ does NOT count the engine's own substitutions as the coach's", () => {
    // Five automatic changes in the replay stream, none of them his.
    const autoSubs = [sub(63, 2), sub(69, 4), sub(72, 6), sub(75, 8), sub(76, 9)];
    renderWithIntl(<MatchSummary {...base} decisions={autoSubs} coachMoves={[]} />);
    expect(screen.queryByText(/Substitution/i)).not.toBeInTheDocument();
  });

  it("lists the changes he DID make", () => {
    renderWithIntl(
      <MatchSummary {...base} decisions={[sub(60, 3), sub(70)]} coachMoves={[sub(70, 7)]} />,
    );
    expect(screen.getByText(/Decisions you took/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Substitution/i)).toHaveLength(1);
  });

  it("⚠️ leaves the shipped packs alone when no coach list is given", () => {
    // /game/draft, /game/chaos and /game/daily answer through `DecisionPrompt`, so there
    // every answer really is the coach's and the old derivation still holds.
    renderWithIntl(<MatchSummary {...base} decisions={[sub(60, 3)]} />);
    expect(screen.getByText(/Decisions you took/i)).toBeInTheDocument();
  });
});

/**
 * ⛔ Owner-reported, 2026-08-19: the section said "80' Substitution" and nothing more, so
 * the coach could not tell which change he had made — let alone judge it.
 */
const player = (playerId: number, name: string, overall: number) => ({
  cardId: `${playerId}@2020` as const,
  playerId,
  season: 2020,
  name,
  role: "CM" as const,
  altRoles: [],
  foot: null,
  height: null,
  provenance: null,
  ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall },
});

const roster = [player(3, "Sami Hyypia", 80), player(4, "Martin Skrtel", 67)];

describe("MatchSummary — what a decision actually did", () => {
  it("names both men and prints their ratings", () => {
    renderWithIntl(
      <MatchSummary
        {...base}
        decisions={[]}
        coachMoves={[{ kind: "sub-offer", minute: 80, side: "home", off: 3, on: 4 }]}
        roster={roster}
      />,
    );
    const row = screen.getByTestId("decision-row");
    expect(row).toHaveTextContent("Sami Hyypia");
    expect(row).toHaveTextContent("80");
    expect(row).toHaveTextContent("Martin Skrtel");
    expect(row).toHaveTextContent("67");
    // Both directions are labelled, so the row cannot be read backwards.
    expect(row).toHaveTextContent(/Off/);
    expect(row).toHaveTextContent(/On/);
  });

  it("names the outfielder who took the gloves", () => {
    renderWithIntl(
      <MatchSummary
        {...base}
        decisions={[]}
        coachMoves={[{ kind: "dismissal", minute: 66, side: "home", inGoal: 4 }]}
        roster={roster}
      />,
    );
    const row = screen.getByTestId("decision-row");
    expect(row).toHaveTextContent(/In goal/);
    expect(row).toHaveTextContent("Martin Skrtel");
  });

  it("⚠️ labels a player it cannot resolve rather than dropping half the change", () => {
    // A row that silently omitted the man coming on would read as a substitution that
    // only took a player off.
    renderWithIntl(
      <MatchSummary
        {...base}
        decisions={[]}
        coachMoves={[{ kind: "sub-offer", minute: 80, side: "home", off: 3, on: 999 }]}
        roster={roster}
      />,
    );
    const row = screen.getByTestId("decision-row");
    expect(row).toHaveTextContent(/On/);
    expect(row).toHaveTextContent("unnamed");
  });

  it("⚠️ leaves the shipped packs unchanged when no roster is given", () => {
    renderWithIntl(
      <MatchSummary
        {...base}
        decisions={[]}
        coachMoves={[{ kind: "sub-offer", minute: 80, side: "home", off: 3, on: 4 }]}
      />,
    );
    /**
     * ⛔ Verified by sabotage. The first version of this test asserted only that the row
     * still said "Substitution" — which stayed green while the row ALSO printed
     * "Off unnamed — On unnamed —", because the id lookup fell through to its
     * unresolvable-player label instead of skipping the detail entirely.
     */
    const row = screen.getByTestId("decision-row");
    expect(row).toHaveTextContent(/Substitution/);
    expect(row.textContent).not.toMatch(/unnamed|Off|On/);
  });
});
