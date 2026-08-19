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
