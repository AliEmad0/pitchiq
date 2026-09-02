import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import { hashEvents } from "@/features/game/domain/hash";
import { buildSession, type RivalSetup } from "@/features/game/view/match-session";

/**
 * ⛔ THE DEFECT CLASS THIS FILE EXISTS FOR — it has shipped TWICE already.
 *
 * A rule that shapes the match must reach EVERY path that rebuilds it: live, resume and
 * share. The `opponent` policy missed one and drafted a different eleven on replay; Budget
 * Cap's `budget` missed one and silently turned the rival's cap into Infinity. Both surfaced
 * as "your saved match is corrupt", because replay verifies by fingerprint — so the symptom
 * points at the codec and the cause is a missing argument three layers away.
 *
 * ⭐ Chemistry is DERIVED from the two XIs rather than carried, so nothing new travels in
 * IndexedDB or the share code and the codec needs no version bump. What must travel is the
 * FLAG, and that is what these tests pin.
 */

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

/**
 * A pool that models the mode's actual tension, which the first draft of this fixture did
 * not: the BEST-rated cards are all strangers (own club, own nation), and the linked cards
 * are ordinary. So an opponent drafted `best` comes out with almost no chemistry while the
 * coach's XI is a single side — the gap the modifier is supposed to act on.
 *
 * ⚠️ The first fixture gave the auto-drafted opponent chemistry 100 against the coach's 83.
 * Both sides were boosted almost equally, the net edge moved ~0.3%, and no dice roll flipped
 * — so the flag looked inert when it was working perfectly. A fixture that cannot show the
 * effect proves nothing about it.
 */
const linked: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 6 }, (_, i) => ({
    cardId: makeCardId(r * 100 + i, 2004),
    playerId: r * 100 + i,
    season: 2004,
    name: `${role}-mate-${i}`,
    role,
    altRoles: [] as PlayerRole[],
    foot: null,
    height: null,
    provenance: null,
    ratings: { attack: 62, creation: 62, defense: 62, physical: 62, discipline: 55, overall: 62 },
    club: "Arsenal",
    teamId: 7,
    nationalityCode: "fr",
  })),
);

/** The stars an opponent drafting on rating alone will take — and none of them link. */
const strangers: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 6 }, (_, i) => ({
    ...linked[0]!,
    cardId: makeCardId(9000 + r * 100 + i, 1994 + ((r + i) % 25)),
    playerId: 9000 + r * 100 + i,
    season: 1994 + ((r + i) % 25),
    name: `${role}-star-${i}`,
    role,
    ratings: { attack: 92, creation: 92, defense: 92, physical: 92, discipline: 55, overall: 92 },
    club: `Club${r * 100 + i}`,
    teamId: 9000 + r * 100 + i,
    nationalityCode: `n${r * 100 + i}`,
  })),
);

const pool: PoolCard[] = [...linked, ...strangers];

const shape = formationByName("4-4-2 Flat");
/** The coach fields the linked side: one club, one season, one nation. */
const xi = shape.slots.map(
  (s, i) => linked.find((c) => c.role === s.role && c.playerId % 100 === i % 6)!,
);
const names = { home: "Home", away: "Away" };

/** Seeds swept where the assertion is "chemistry changes the match" — see that test for why. */
const SEEDS = [4242, 7, 99, 1234, 55555, 8080, 31337, 2024, 606, 12, 777, 90210];

/** Play a whole match out of a session and fingerprint it, exactly as resume/share do. */
function play(rival: RivalSetup, seed = 4242): { fingerprint: number; goals: number } {
  const session = buildSession(pool, xi, shape, seed, names, rival);
  let step = session.stream.advance();
  let guard = 0;
  while (step.kind !== "done" && guard++ < 500) {
    step =
      step.kind === "decision"
        ? session.stream.answer({ kind: "noop" } as never)
        : session.stream.advance();
  }
  const result = step.kind === "done" ? step.result : null;
  return {
    fingerprint: hashEvents(result?.events ?? []),
    goals: (result?.score.home ?? 0) + (result?.score.away ?? 0),
  };
}

describe("chemistry survives every rebuild path", () => {
  it("⛔ the SAME flags replay byte-identically — the fingerprint check resume relies on", () => {
    const live = play({ policy: "best", chemistry: true });
    const replay = play({ policy: "best", chemistry: true });
    expect(replay.fingerprint).toBe(live.fingerprint);
  });

  it("⛔ a replay that FORGOT the flag produces a DIFFERENT match", () => {
    /**
     * The whole point. If these agreed everywhere, the flag would be decorative and this suite
     * would be proving nothing — but it would also mean chemistry never reached the engine at
     * all. They must differ, and every path must therefore pass it.
     *
     * ⛔ SWEPT OVER SEEDS, not asserted on one. `CHEM_EFFECT` is deliberately small (0.03 —
     * "rewarded, never decisive"), so in any SINGLE match it may not tip a dice roll and the
     * two fingerprints agree by coincidence. Pinning one seed made this test fail the moment
     * TASK-1844 re-fitted the constant, which is a false negative, not a defect: a fixture that
     * cannot show the effect proves nothing about it.
     */
    const differing = SEEDS.filter(
      (s) =>
        play({ policy: "best", chemistry: true }, s).fingerprint !==
        play({ policy: "best" }, s).fingerprint,
    );
    // MEASURED at 5 of 12 differing (2026-09-01, CHEM_EFFECT 0.03). The floor is 3 so there is
    // real margin: if this ever drops to 1, the next constant nudge would make it vacuous.
    expect(differing.length).toBeGreaterThanOrEqual(3);
  });

  it("⛔ THE INERTNESS CONTROL — a pack without the flag is byte-identical to before", () => {
    // Legacy, Captain's Draft, Budget Cap, the Nationality Draft and every stored daily
    // challenge run through this same function. Absent must mean untouched.
    const a = play({ policy: "best", budget: 1200 });
    const b = play({ policy: "best", budget: 1200, chemistry: false });
    expect(b.fingerprint).toBe(a.fingerprint);
  });

  it("⚠️ the flag rides WITH the other identity fields, not instead of them", () => {
    // Budget and chemistry are independent rules; setting one must not disturb the other.
    // Swept for the same reason as above — a small constant need not move every single match.
    const differing = SEEDS.filter(
      (s) =>
        play({ policy: "best", budget: 1200, chemistry: true }, s).fingerprint !==
        play({ policy: "best", budget: 1200 }, s).fingerprint,
    );
    expect(differing.length).toBeGreaterThanOrEqual(3);
  });

  it("⚠️ a match still finishes and scores — the modifier must not break the engine", () => {
    const r = play({ policy: "best", chemistry: true });
    expect(Number.isFinite(r.goals)).toBe(true);
    expect(r.goals).toBeGreaterThanOrEqual(0);
    expect(r.goals).toBeLessThan(20);
  });
});
