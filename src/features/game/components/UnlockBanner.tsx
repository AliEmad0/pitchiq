"use client";

import { useTranslations } from "next-intl";
import { type AchievementId, achievementKey } from "@/features/game/domain/achievements";

/**
 * TASK-1813 — the full-time line for what this match unlocked for the first time. Renders
 * nothing when it unlocked nothing (or before the record has resolved).
 */
export function UnlockBanner({ ids }: { ids: readonly AchievementId[] }) {
  const t = useTranslations("gameTrophies");
  if (ids.length === 0) return null;
  return (
    <div className="ub-banner" role="status">
      <span className="ub-label">🏆 {t("unlocked")}</span>
      <span className="ub-names">
        {ids.map((id) => t(`name.${achievementKey(id)}`)).join(" · ")}
      </span>
    </div>
  );
}
