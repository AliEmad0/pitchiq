import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import type { CommentaryRef } from "@/features/game/domain/commentary";
import { commentaryArgs } from "@/features/game/view/commentary-view";
import ar from "@/i18n/messages/ar.json";
import en from "@/i18n/messages/en.json";

// Every key commentate can emit, with a representative ref.
const REFS: CommentaryRef[] = [
  { key: "commentary.kickoff", values: {} },
  { key: "commentary.goal.0", values: { player: "P", minute: 10, homeScore: 1, awayScore: 0 } },
  { key: "commentary.goal.1", values: { player: "P", minute: 20, homeScore: 1, awayScore: 0 } },
  { key: "commentary.goal.2", values: { player: "P", minute: 30, homeScore: 1, awayScore: 0 } },
  { key: "commentary.goal.3", values: { player: "P", minute: 40, homeScore: 1, awayScore: 0 } },
  { key: "commentary.goalAnon", values: { minute: 50, homeScore: 1, awayScore: 0 } },
  { key: "commentary.cardYellow.0", values: { player: "P", minute: 11 } },
  { key: "commentary.cardYellow.1", values: { player: "P", minute: 22 } },
  { key: "commentary.cardYellow.2", values: { player: "P", minute: 33 } },
  { key: "commentary.cardRed.0", values: { player: "P", minute: 44 } },
  { key: "commentary.cardRed.1", values: { player: "P", minute: 55 } },
  { key: "commentary.cardAnon", values: { minute: 66 } },
  { key: "commentary.halftime", values: { homeScore: 1, awayScore: 0 } },
  { key: "commentary.fulltime", values: { homeScore: 2, awayScore: 1 } },
];

function lookup(messages: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((o, part) => (o as Record<string, unknown> | undefined)?.[part], messages);
}

// next-intl's `t` is typed to known key literals; commentary keys are dynamic strings.
type Translate = (key: string, values?: Record<string, string | number>) => string;
function translator(locale: "en" | "ar", messages: unknown): Translate {
  return createTranslator({ locale, messages: messages as Record<string, never> }) as unknown as Translate;
}

describe("commentary catalog", () => {
  it("every emittable key exists in en and ar", () => {
    for (const { key } of REFS) {
      expect(typeof lookup(en, key), `en missing ${key}`).toBe("string");
      expect(typeof lookup(ar, key), `ar missing ${key}`).toBe("string");
    }
  });

  it("renders every message in both locales with no missing args", () => {
    for (const locale of ["en", "ar"] as const) {
      const t = translator(locale, locale === "en" ? en : ar);
      for (const ref of REFS) {
        const text = t(ref.key, commentaryArgs(ref, locale));
        expect(text.length, `${locale} ${ref.key}`).toBeGreaterThan(0);
      }
    }
  });

  it("renders Eastern-Arabic digits on ar", () => {
    const t = translator("ar", ar);
    const goal = REFS[1]; // minute 10, score 1-0
    const text = t(goal.key, commentaryArgs(goal, "ar"));
    expect(text).toMatch(/[٠-٩]/); // contains at least one Eastern-Arabic digit
    expect(text).not.toMatch(/[0-9]/); // and no Western digits
  });
});
