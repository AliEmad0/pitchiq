import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import { chaosDraft, type PoolCard } from "@/features/game/domain/chaos-draft";
import { DAILY_CHEMISTRY_FROM, dailyChemistry } from "@/features/game/domain/daily";
import { formationByName } from "@/features/game/domain/formation";
import { hashEvents } from "@/features/game/domain/hash";
import { buildSession, type RivalSetup } from "@/features/game/view/match-session";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { DailyHub } = await import("@/features/game/components/DailyHub");

/**
 * TASK-1824 remainder — the daily plays chemistry from `DAILY_CHEMISTRY_FROM`.
 *
 * ⛔ Derived from the day, never stored, exactly like `DAILY_CRISIS_FROM`: every stored day must
 * replay under the rule its own day was played under, so moving this date would re-map history.
 */
describe("the daily chemistry gate", () => {
  it("⛔ GOLDEN — off the day before, on from the day itself", () => {
    expect(DAILY_CHEMISTRY_FROM).toBe("2026-10-24");
    expect(dailyChemistry("2026-10-23")).toBe(false);
    expect(dailyChemistry("2026-10-24")).toBe(true);
    expect(dailyChemistry("2027-01-01")).toBe(true);
    expect(dailyChemistry("2026-08-23")).toBe(false);
  });

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
  const pool: PoolCard[] = ROLES.flatMap((role, r) =>
    Array.from({ length: 8 }, (_, i) => ({
      cardId: makeCardId(r * 100 + i, 2015 + (i % 4)),
      playerId: r * 100 + i,
      season: 2015 + (i % 4),
      name: `${role}-${i}`,
      role,
      altRoles: [...ROLES],
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
      club: `C${i % 3}`,
      teamId: 40 + (i % 3),
      nationalityCode: i % 2 ? "fr" : "it",
    })),
  );
  const shape = formationByName("4-4-2 Flat")!;
  const play = (day: string, seed: number, base: RivalSetup = {}) => {
    const mine = chaosDraft(pool, seed * 7, "mine", { policy: "strong" });
    const s = buildSession(
      pool,
      mine.players as PoolCard[],
      shape,
      seed,
      { home: "A", away: "B" },
      {
        ...base,
        chemistry: dailyChemistry(day),
        fit: dailyChemistry(day),
      },
    );
    let step = s.stream.advance();
    for (let g = 0; step.kind !== "done" && g < 500; g++) {
      step =
        step.kind === "decision" ? s.stream.answer({ kind: "noop" } as never) : s.stream.advance();
    }
    return hashEvents(step.kind === "done" ? step.result.events : []);
  };

  it("⛔ a record from before the gate replays exactly as it was played — no chemistry at all", () => {
    for (const seed of [11, 22, 33, 44]) {
      const s = buildSession(
        pool,
        chaosDraft(pool, seed * 7, "mine", { policy: "strong" }).players as PoolCard[],
        shape,
        seed,
        { home: "A", away: "B" },
        {},
      );
      let step = s.stream.advance();
      for (let g = 0; step.kind !== "done" && g < 500; g++) {
        step =
          step.kind === "decision"
            ? s.stream.answer({ kind: "noop" } as never)
            : s.stream.advance();
      }
      expect(play("2026-10-23", seed)).toBe(
        hashEvents(step.kind === "done" ? step.result.events : []),
      );
    }
  });

  it("…and a day from the gate on plays a different match on some seeds — the flag reaches the engine", () => {
    const seeds = [11, 22, 33, 44, 55, 66, 77, 88, 99, 111, 222, 333];
    const differing = seeds.filter((s) => play("2026-10-24", s) !== play("2026-10-23", s));
    expect(differing.length).toBeGreaterThanOrEqual(2);
  });
});

describe("chemistry on the daily hub", () => {
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
  const pool: PoolCard[] = ROLES.flatMap((role, r) =>
    Array.from({ length: 10 }, (_, p) => ({
      cardId: makeCardId(r * 20 + p, 2020),
      playerId: r * 20 + p,
      season: 2020,
      name: `${role}-${p}`,
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
        overall: p < 9 ? 55 + p * 2 : 80,
      },
      club: "Club",
    })),
  );
  const mount = (chemistry?: boolean) =>
    renderWithIntl(
      <DailyHub
        pool={pool}
        today="2026-10-24"
        dayNumber={7}
        formation={formationByName("4-4-2 Flat")!}
        seed={1234}
        stats={{ played: 0, won: 0, currentStreak: 0, bestStreak: 0, bestMargin: 0 }}
        history={[]}
        onComplete={vi.fn()}
        chemistry={chemistry}
      />,
    );

  it("⭐ a chemistry day shows the meter and the links on the pitch", () => {
    mount(true);
    expect(screen.getByTestId("chem-meter")).toBeInTheDocument();
    expect(screen.getByTestId("chem-links")).toHaveStyle({ pointerEvents: "none" });
  });

  it("⛔ THE CONTROL — a day without chemistry renders none of it", () => {
    mount();
    expect(screen.queryByTestId("chem-meter")).toBeNull();
    expect(screen.queryByTestId("chem-links")).toBeNull();
  });
});

describe("chemistry on the daily preview", async () => {
  const { DailyPreview } = await import("@/features/game/components/DailyPreview");
  const { teamFitChemistry } = await import("@/features/game/domain/chemistry");
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
  const pool: PoolCard[] = ROLES.flatMap((role, r) =>
    Array.from({ length: 6 }, (_, i) => ({
      cardId: makeCardId(r * 100 + i, 2019),
      playerId: r * 100 + i,
      season: 2019,
      name: `${role}-${i}`,
      role,
      altRoles: [],
      foot: null,
      height: null,
      provenance: null,
      ratings: { attack: 60, creation: 60, defense: 60, physical: 60, discipline: 60, overall: 70 },
      club: "A",
      teamId: 3,
      nationalityCode: "fr",
    })),
  );
  const shape = formationByName("4-4-2 Flat")!;
  const xi = shape.slots.map((s, i) => pool.filter((c) => c.role === s.role)[i % 2]!);
  const s = buildSession(pool, xi, shape, 5, { home: "A", away: "B" }, {});

  it("⭐ shows both sides' chemistry — the SAME figure for each, from the live session", () => {
    renderWithIntl(
      <DailyPreview
        home={s.home}
        away={s.away}
        referee={null}
        weather={null}
        chemistry
        onKickOff={vi.fn()}
      />,
    );
    expect(screen.getByTestId("daily-chem-home")).toHaveTextContent(
      String(teamFitChemistry(s.home)),
    );
    expect(screen.getByTestId("daily-chem-away")).toHaveTextContent(
      String(teamFitChemistry(s.away)),
    );
  });

  it("⛔ THE CONTROL — no chemistry, no figures", () => {
    renderWithIntl(
      <DailyPreview
        home={s.home}
        away={s.away}
        referee={null}
        weather={null}
        onKickOff={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("daily-chem-home")).toBeNull();
    expect(screen.queryByTestId("chem-off-warn")).toBeNull();
  });
});
