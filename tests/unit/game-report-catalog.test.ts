import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { HEADLINE_POOL, type HeadlineArc } from "@/features/game/domain/match-headline";
import ar from "@/i18n/messages/ar.json";
import en from "@/i18n/messages/en.json";

/**
 * TASK-1815 — every headline `headlineFor` can return must render in BOTH locales with
 * no missing argument. Keys are dotted paths, so a pool written as a JSON array (or a
 * missing wording) surfaces here as an unresolved key.
 */
const ARCS: HeadlineArc[] = [
  "comeback",
  "lateWinner",
  "lateLoser",
  "robbed",
  "smashAndGrab",
  "routWin",
  "routLoss",
  "hatTrick",
  "tenMen",
  "varDrama",
  "boreDraw",
  "thriller",
  "win",
  "draw",
  "loss",
];
type T = (k: string, v?: Record<string, string | number>) => string;
const VALUES = {
  coach: "C",
  opponent: "O",
  coachGoals: "1",
  oppGoals: "0",
  player: "P",
  minute: "88",
};
const OTHER = {
  "game.report.xgAria": { home: "H", away: "A", homeXg: "1.0", awayXg: "0.5" },
  "game.report.xgLine": { homeXg: "1.0", awayXg: "0.5" },
  "game.report.ownGoal": { name: "N" },
  "game.report.scorerCount": { name: "N", goals: "2" },
  "game.report.masthead": {},
  "game.report.aria": {},
  "game.report.xgTitle": {},
};

describe("post-match report catalog", () => {
  for (const [locale, messages] of [
    ["en", en],
    ["ar", ar],
  ] as const) {
    const t = createTranslator({
      locale,
      messages: messages as Record<string, never>,
      onError: (e) => {
        throw e;
      },
    }) as unknown as T;

    it(`every headline renders in ${locale} with no missing args`, () => {
      for (const arc of ARCS)
        for (let i = 0; i < HEADLINE_POOL; i++) {
          const out = t(`game.report.headline.${arc}.${i}`, VALUES);
          expect(out, `${locale} ${arc}.${i}`).not.toMatch(/game\.report|\{/);
        }
    });

    it(`every other report string renders in ${locale}`, () => {
      for (const [key, values] of Object.entries(OTHER))
        expect(t(key, values), `${locale} ${key}`).not.toMatch(/game\.report|\{/);
    });
  }
});
