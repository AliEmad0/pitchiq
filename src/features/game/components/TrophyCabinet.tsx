"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  ACHIEVEMENTS,
  type AchievementId,
  achievementKey,
} from "@/features/game/domain/achievements";
import type { Unlock } from "@/features/game/storage/trophy-slot";
import { localizeDigits } from "@/utils/format";

const PER_SHELF = 4;

/**
 * TASK-1813 — the owner's Hall #1 "Trophy Cabinet": glass shelves, a cup per achievement, lit
 * once earned and dark until then. Every cup is a button: it says what it takes, and — once
 * earned — when and how.
 */
export function TrophyCabinet({ unlocks }: { unlocks: readonly Unlock[] }) {
  const t = useTranslations("gameTrophies");
  const locale = useLocale();
  const d = (v: string | number) => localizeDigits(v, locale);
  const byId = new Map(unlocks.map((u) => [u.id, u]));
  const [open, setOpen] = useState<AchievementId | null>(null);
  const shelves = Array.from({ length: Math.ceil(ACHIEVEMENTS.length / PER_SHELF) }, (_, i) =>
    ACHIEVEMENTS.slice(i * PER_SHELF, i * PER_SHELF + PER_SHELF),
  );
  const chosen = open == null ? null : ACHIEVEMENTS.find((a) => a.id === open)!;
  const won = chosen == null ? undefined : byId.get(chosen.id);

  return (
    <div className="tc-root">
      <p className="tc-count">
        {t("hallCount", { n: d(byId.size), total: d(ACHIEVEMENTS.length) })}
      </p>
      <div className="tc-cabinet">
        {shelves.map((shelf, s) => (
          <div key={s} className="tc-shelf">
            {shelf.map((a, i) => {
              const lit = byId.has(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  data-testid="tc-cup"
                  className={`tc-cup${lit ? " is-lit" : ""}`}
                  aria-pressed={open === a.id}
                  style={{ ["--i" as string]: s * PER_SHELF + i } as React.CSSProperties}
                  onClick={() => setOpen(a.id)}
                >
                  <span className="tc-icon" aria-hidden>
                    {a.icon}
                  </span>
                  <span className="tc-name">{t(`name.${achievementKey(a.id)}`)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="tc-detail" data-testid="tc-detail" role="status">
        {chosen == null ? (
          t("tapCup")
        ) : (
          <>
            <b>
              {chosen.icon} {t(`name.${achievementKey(chosen.id)}`)}
            </b>{" "}
            — {t(`condition.${achievementKey(chosen.id)}`)}
            <br />
            <span className="tc-when">
              {won == null
                ? t("locked")
                : won.context === ""
                  ? t("unlockedDay", { day: d(won.day) })
                  : t("unlockedOn", { day: d(won.day), context: d(won.context) })}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
