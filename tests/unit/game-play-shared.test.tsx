import { screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName, formationKey } from "@/features/game/domain/formation";
import { hashEvents } from "@/features/game/domain/hash";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";
import type { MatchEvent } from "@/features/game/domain/match-types";
import { buildSession } from "@/features/game/view/match-session";
import { buildShareCode } from "@/features/game/view/share-link";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

/** The same in-memory stand-in `game-play-container` uses. */
const slot = {
  saved: null as unknown,
  save: vi.fn(async (m: unknown) => {
    slot.saved = m;
  }),
  load: vi.fn(async () => slot.saved),
  clear: vi.fn(async () => {
    slot.saved = null;
  }),
};

vi.mock("@/features/game/storage/match-slot", () => ({
  saveMatch: (m: unknown) => slot.save(m),
  loadMatch: () => slot.load(),
  clearMatch: () => slot.clear(),
}));

const { GamePlay } = await import("@/features/game/components/GamePlay");

const ROLES: PlayerRole[] = [
  "GK",
  "LB",
  "CB",
  "RB",
  "LM",
  "CM",
  "RM",
  "CDM",
  "CAM",
  "LW",
  "RW",
  "CF",
];
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  [0, 1, 2, 3].map((i) => ({
    cardId: makeCardId(1000 + r * 10 + i, 2020),
    playerId: 1000 + r * 10 + i,
    season: 2020,
    name: `${role}-${i}`,
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
      overall: 50,
    },
    club: "Club",
  })),
);

const FORMATION = formationByName("4-4-2 Flat");
const squad = () => FORMATION.slots.map((s) => pool.find((c) => c.role === s.role)!);

/** What a coach produces — never `defaultAnswer`, which can carry an unencodable reason. */
const coachAnswer = (d: MatchDecision): DecisionAnswer => {
  const base = { minute: d.minute, side: d.side };
  if (d.kind === "response") return { kind: "response", ...base, choice: "overload" };
  if (d.kind === "injury-sub") return { kind: "injury-sub", ...base };
  if (d.kind === "dismissal") return { kind: "dismissal", ...base };
  return { kind: "sub-offer", ...base };
};

/** Play a match to full time, keeping what the coach answered along the way. */
function playMatch(seed: number) {
  const session = buildSession(pool, squad(), FORMATION, seed, {
    home: "Your XI",
    away: "Rivals",
  });
  const events: MatchEvent[] = [];
  const answers: DecisionAnswer[] = [];
  let step = session.stream.advance();
  events.push(...step.events);
  while (step.kind === "decision") {
    const a = coachAnswer(step.decision);
    answers.push(a);
    step = session.stream.answer(a);
    events.push(...step.events);
  }
  return { answers, events };
}

/**
 * The link a coach would copy.
 *
 * `keepAnswers` truncates the decision list to build a code for an UNFINISHED match.
 * ⚠️ It must be a genuine PREFIX of the real answers, not an arbitrary short stream: a
 * token whose kind does not match the decision being raised is REFUSED outright, so
 * hand-shortening the token field produces a rejected code rather than a partial match.
 */
function codeForAMatch(seed = 4242, keepAnswers?: number): string {
  const { answers, events } = playMatch(seed);
  return buildShareCode({
    cardIds: squad().map((c) => c.cardId),
    formationKey: formationKey(FORMATION),
    seed,
    answers: keepAnswers == null ? answers : answers.slice(0, keepAnswers),
    fingerprint: hashEvents(events),
  });
}

const renderWith = (ui: ReactElement, search: Record<string, string>) =>
  renderWithIntl(<NuqsTestingAdapter searchParams={search}>{ui}</NuqsTestingAdapter>);

describe("arriving with ?m=", () => {
  beforeEach(() => {
    slot.saved = null;
    slot.save.mockClear();
    slot.load.mockClear();
    slot.clear.mockClear();
  });

  it("enters the shared match rather than the draft hub", async () => {
    renderWith(<GamePlay pool={pool} />, { m: codeForAMatch() });
    // A shared match arrives FINISHED, so the full-time control is already there.
    expect(await screen.findByRole("button", { name: "Full time" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Auto-fill" })).toBeNull();
  });

  it("⛔ never writes the visitor's match slot", async () => {
    // The rule: watching someone else's match must not overwrite your own.
    renderWith(<GamePlay pool={pool} />, { m: codeForAMatch() });
    await screen.findByRole("button", { name: "Full time" });
    // Asserted by reading the WRITE, not by inspecting the screen — only the write proves
    // the visitor's own saved match survived.
    expect(slot.save).not.toHaveBeenCalled();
  });

  it("⛔ never writes the slot for an UNFINISHED shared match either", async () => {
    // ⚠️ This is the case that actually exercises the guard. A finished shared match
    // leaves the persist effect early anyway (`result != null`), so the test above passes
    // whether or not the guard exists. A code carrying FEWER decisions than the match
    // raises — trivially hand-edited, since a code is untrusted input — replays to a
    // PENDING decision, which is live with no result: precisely the state that persists.
    // Verified to go red with the `if (shared) return` guard removed.
    renderWith(<GamePlay pool={pool} />, { m: codeForAMatch(4242, 3) });
    // It lands in a live, unfinished match rather than at full time.
    await vi.waitFor(() => {
      expect(screen.queryByRole("button", { name: "Auto-fill" })).toBeNull();
    });
    expect(screen.queryByRole("button", { name: "Full time" })).toBeNull();
    expect(slot.save).not.toHaveBeenCalled();
  });

  it("⛔ suppresses the resume offer, leaving the saved match untouched", async () => {
    // A visitor with their own match in progress follows a friend's link.
    slot.saved = {
      cardIds: squad().map((c) => c.cardId),
      formationKey: formationKey(FORMATION),
      seed: 999,
      answers: [],
      fingerprint: 1,
      eventCount: 1,
    };
    renderWith(<GamePlay pool={pool} />, { m: codeForAMatch() });
    await screen.findByRole("button", { name: "Full time" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(slot.saved).not.toBeNull();
    expect(slot.clear).not.toHaveBeenCalled();
  });

  it("falls back to the ordinary hub when the code is malformed", async () => {
    renderWith(<GamePlay pool={pool} />, { m: "not-a-code" });
    // Not an error screen — a stranger following a mangled link lands somewhere usable.
    expect(await screen.findByRole("button", { name: "Auto-fill" })).toBeInTheDocument();
  });

  it("falls back to the hub when the code is well-formed but unplayable here", async () => {
    // A card that has left the pool: decodes cleanly, cannot be replayed.
    const parts = codeForAMatch().split(".");
    const cards = parts[3]!.split("_");
    cards[0] = `${(999999).toString(36)}-${(2020).toString(36)}`;
    parts[3] = cards.join("_");
    renderWith(<GamePlay pool={pool} />, { m: parts.join(".") });
    expect(await screen.findByRole("button", { name: "Auto-fill" })).toBeInTheDocument();
  });

  it("an ordinary visit is unaffected — no ?m=, the hub as before", async () => {
    renderWith(<GamePlay pool={pool} />, {});
    expect(await screen.findByRole("button", { name: "Auto-fill" })).toBeInTheDocument();
  });
});
