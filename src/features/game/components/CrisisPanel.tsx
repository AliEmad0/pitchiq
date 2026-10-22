"use client";

import { useTranslations } from "next-intl";
import type { CrisisDecision, DecisionAnswer } from "@/features/game/domain/match-decisions";

/**
 * The mid-match crisis (TASK-1814 follow-up): "{name} is out on his feet." Two calls, each with
 * its cost said plainly — push on (more drive, a real chance he breaks down) or take him off.
 *
 * ⚠️ Shown on BOTH live screens (`MatchLive` and the older `DecisionPrompt`), so the copy lives
 * here once. "Take him off" is disabled when no change is possible, and says why.
 */
export function CrisisPanel({
  decision,
  secondsLeft,
  onAnswer,
}: {
  decision: CrisisDecision;
  secondsLeft?: number | null;
  onAnswer: (a: DecisionAnswer) => void;
}) {
  const t = useTranslations("gameCrisis");
  const base = { kind: "crisis" as const, minute: decision.minute, side: decision.side };
  const canRest = decision.legalOn.length > 0;
  return (
    <section className="cr-panel" data-testid="crisis-panel" aria-label={t("title")}>
      <div className="cr-head">
        <h3 className="cr-title">{t("title")}</h3>
        {secondsLeft != null ? (
          <span className="cr-clock" aria-live="polite">
            {t("left", { seconds: secondsLeft })}
          </span>
        ) : null}
      </div>
      <p className="cr-body">{t("body", { name: decision.name, minute: decision.minute })}</p>
      <div className="cr-choices">
        <button
          type="button"
          className="cr-choice"
          data-testid="crisis-push"
          onClick={() => onAnswer({ ...base, choice: "push" })}
        >
          <b>{t("push")}</b>
          <span>{t("pushHint")}</span>
        </button>
        <button
          type="button"
          className="cr-choice"
          data-testid="crisis-rest"
          disabled={!canRest}
          onClick={() => onAnswer({ ...base, choice: "rest" })}
        >
          <b>{t("rest")}</b>
          <span>{canRest ? t("restHint") : t("restNone")}</span>
        </button>
      </div>
    </section>
  );
}
