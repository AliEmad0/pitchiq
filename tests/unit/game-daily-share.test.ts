import { describe, expect, it } from "vitest";
import { matchStrip, shareText } from "@/features/game/domain/daily-share";
import type { MatchEvent } from "@/features/game/domain/match-types";

const goal = (
  minute: number,
  side: "home" | "away",
  extra: Partial<MatchEvent> = {},
): MatchEvent => ({
  minute,
  kind: "goal",
  side,
  ...extra,
});

describe("matchStrip", () => {
  it("paints six cells of fifteen minutes", () => {
    expect(matchStrip([], "home")).toBe("⬜⬜⬜⬜⬜⬜");
  });

  it("places goals in the right quarter-hour", () => {
    expect(matchStrip([goal(1, "home")], "home")).toBe("🟩⬜⬜⬜⬜⬜");
    expect(matchStrip([goal(15, "home")], "home")).toBe("🟩⬜⬜⬜⬜⬜");
    expect(matchStrip([goal(16, "home")], "home")).toBe("⬜🟩⬜⬜⬜⬜");
    expect(matchStrip([goal(90, "home")], "home")).toBe("⬜⬜⬜⬜⬜🟩");
  });

  it("⚠️ folds stoppage-time goals into the last cell", () => {
    expect(matchStrip([goal(94, "home")], "home")).toBe("⬜⬜⬜⬜⬜🟩");
  });

  it("shows conceded goals and both-scored cells", () => {
    expect(matchStrip([goal(20, "away")], "home")).toBe("⬜🟥⬜⬜⬜⬜");
    expect(matchStrip([goal(20, "home"), goal(25, "away")], "home")).toBe("⬜🟨⬜⬜⬜⬜");
  });

  it("⛔ a VAR-disallowed goal paints nothing", () => {
    // The goal stays in the timeline and counts on the scoreboard until its verdict
    // arrives; a FINAL scoreline filters on disallowedAt == null. The strip is final.
    expect(matchStrip([goal(30, "home", { disallowedAt: 32 })], "home")).toBe("⬜⬜⬜⬜⬜⬜");
  });

  it("⚠️ credits an own goal to the side it COUNTS FOR", () => {
    // The engine emits own goals with playerId undefined, the scorer in ownGoalBy, and
    // `side` = the side that benefits. Reading playerId here is the TASK-1812 bug.
    const og = goal(50, "home", { playerId: undefined, ownGoalBy: 99 });
    expect(matchStrip([og], "home")).toBe("⬜⬜⬜🟩⬜⬜");
  });

  it("mirrors for the away perspective", () => {
    expect(matchStrip([goal(20, "home")], "away")).toBe("⬜🟥⬜⬜⬜⬜");
  });

  it("ignores non-goal events entirely", () => {
    const noise: MatchEvent[] = [
      { minute: 10, kind: "card", side: "home", card: "yellow" },
      { minute: 20, kind: "chance", side: "home" },
      { minute: 45, kind: "halftime" },
    ];
    expect(matchStrip(noise, "home")).toBe("⬜⬜⬜⬜⬜⬜");
  });
});

const LABELS = { title: "PitchIQ Daily", win: "✅", draw: "🤝", loss: "❌" };

describe("shareText", () => {
  const base = {
    dayNumber: 217,
    formationName: "4-2-3-1",
    score: { home: 3, away: 1 },
    strip: "⬜🟩⬜🟥🟩🟩",
    currentStreak: 5,
    bestStreak: 12,
    url: "https://pitchiq.app/game/daily",
    labels: LABELS,
  };

  it("lays out header, score, strip, streaks and url", () => {
    expect(shareText({ ...base, locale: "en" })).toBe(
      [
        "PitchIQ Daily #217 · 4-2-3-1",
        "3–1 ✅",
        "⬜🟩⬜🟥🟩🟩",
        "🔥 5   🏆 12",
        "https://pitchiq.app/game/daily",
      ].join("\n"),
    );
  });

  it("marks a draw and a loss", () => {
    expect(shareText({ ...base, score: { home: 1, away: 1 }, locale: "en" })).toContain("1–1 🤝");
    expect(shareText({ ...base, score: { home: 0, away: 2 }, locale: "en" })).toContain("0–2 ❌");
  });

  it("⛔ localizes EVERY digit for Arabic", () => {
    // Intl.NumberFormat("ar") returns WESTERN digits in the browser — measured, not
    // assumed. localizeDigits is the only correct path.
    const text = shareText({ ...base, locale: "ar" });
    expect(text).toContain("٣–١");
    expect(text).toContain("#٢١٧");
    expect(text).toContain("🔥 ٥");
    expect(text).toContain("🏆 ١٢");
  });

  it("⛔ leaves the URL's digits alone", () => {
    // Transliterating a host or path would produce a link that does not resolve.
    const text = shareText({
      ...base,
      url: "https://pitchiq.app/game/daily?d=2026",
      locale: "ar",
    });
    expect(text).toContain("https://pitchiq.app/game/daily?d=2026");
  });
});
