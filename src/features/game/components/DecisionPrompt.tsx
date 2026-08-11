"use client";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";

interface Props {
  decision: MatchDecision;
  /** Seconds before the prompt answers itself, or null to disable the limit. */
  limit: number | null;
  onAnswer: (a: DecisionAnswer) => void;
}

/** What a lapsed timer chooses. Always the least disruptive option available. */
export function fallbackFor(d: MatchDecision): DecisionAnswer {
  const base = { minute: d.minute, side: d.side };
  if (d.kind === "response") return { kind: "response", ...base, choice: "hold" };
  if (d.kind === "injury-sub") return { kind: "injury-sub", ...base, on: undefined };
  if (d.kind === "dismissal") return { kind: "dismissal", ...base };
  return { kind: "sub-offer", ...base };
}

/**
 * The in-match decision modal.
 *
 * ⚠️ The countdown NEVER reaches the engine. A timeout PICKS a decision, and that
 * decision is the input — recorded and replayed, a timed-out answer is indistinguishable
 * from a deliberate one. A clock read inside the generator would break replay, which is
 * the same rule that governs the draft pick timer.
 *
 * The limit is extendable and disableable (`limit: null`) per WCAG 2.2.1.
 */
export function DecisionPrompt({ decision, limit, onAnswer }: Props) {
  const t = useTranslations("game");
  const [left, setLeft] = useState<number | null>(limit);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    box.current?.focus();
  }, [decision]);

  useEffect(() => {
    if (limit == null) {
      setLeft(null);
      return;
    }
    setLeft(limit);
    const id = window.setInterval(() => {
      setLeft((v) => (v == null || v <= 1 ? 0 : v - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [decision, limit]);

  const answer = useCallback((a: DecisionAnswer) => onAnswer(a), [onAnswer]);

  useEffect(() => {
    if (left !== 0) return;
    answer(fallbackFor(decision));
  }, [left, decision, answer]);

  const title =
    decision.kind === "response"
      ? t("decisionResponseTitle")
      : decision.kind === "injury-sub"
        ? t("decisionInjuryTitle")
        : decision.kind === "dismissal"
          ? t("decisionDismissalTitle")
          : t("decisionSubTitle");

  return (
    <div
      ref={box}
      role="dialog"
      aria-modal="true"
      aria-label={t("decisionAria")}
      tabIndex={-1}
      className="bg-background/95 ring-border fixed inset-x-4 bottom-6 z-50 mx-auto max-w-lg rounded-xl p-5 shadow-2xl ring-1 backdrop-blur"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
        {left != null ? (
          <span aria-live="polite" className="text-muted-foreground font-mono text-sm">
            {t("decisionTimeLeft", { seconds: left })}
          </span>
        ) : null}
      </div>

      {decision.kind === "response" ? (
        <>
          <p className="text-muted-foreground mt-1 text-sm">{t("decisionResponseBody")}</p>
          <div className="mt-4 grid gap-2">
            {(["overload", "stabilize", "hold"] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() =>
                  answer({
                    kind: "response",
                    minute: decision.minute,
                    side: decision.side,
                    choice,
                  })
                }
                className="border-border hover:bg-muted rounded-lg border px-4 py-3 text-start transition-colors"
              >
                <span className="block font-semibold">
                  {choice === "overload"
                    ? t("decisionOverload")
                    : choice === "stabilize"
                      ? t("decisionStabilize")
                      : t("decisionHold")}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {choice === "overload"
                    ? t("decisionOverloadHint")
                    : choice === "stabilize"
                      ? t("decisionStabilizeHint")
                      : t("decisionHoldHint")}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <SquadChoice decision={decision} onAnswer={answer} />
      )}
    </div>
  );
}

function SquadChoice({
  decision,
  onAnswer,
}: {
  decision: Exclude<MatchDecision, { kind: "response" }>;
  onAnswer: (a: DecisionAnswer) => void;
}) {
  const t = useTranslations("game");
  const legalOff = decision.kind === "injury-sub" ? [] : decision.legalOff;
  const [off, setOff] = useState<number | undefined>(
    decision.kind === "injury-sub" ? decision.off : undefined,
  );
  const [on, setOn] = useState<number | undefined>(undefined);
  const base = { minute: decision.minute, side: decision.side };

  const body =
    decision.kind === "injury-sub"
      ? t("decisionInjuryBody")
      : decision.kind === "dismissal"
        ? t("decisionDismissalBody")
        : t("decisionSubBody");

  return (
    <>
      <p className="text-muted-foreground mt-1 text-sm">{body}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {decision.kind !== "injury-sub" ? (
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-bold uppercase">
              {t("decisionOff")}
            </p>
            <div className="max-h-40 overflow-y-auto">
              {legalOff.map((p) => (
                <button
                  key={p.playerId}
                  type="button"
                  onClick={() => setOff(p.playerId)}
                  aria-pressed={off === p.playerId}
                  className={
                    off === p.playerId
                      ? "bg-primary text-primary-foreground block w-full rounded px-2 py-1 text-start text-sm"
                      : "hover:bg-muted block w-full rounded px-2 py-1 text-start text-sm"
                  }
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-bold uppercase">
            {t("decisionOn")}
          </p>
          <div className="max-h-40 overflow-y-auto">
            {decision.legalOn.map((p) => (
              <button
                key={p.playerId}
                type="button"
                onClick={() => setOn(p.playerId)}
                aria-pressed={on === p.playerId}
                className={
                  on === p.playerId
                    ? "bg-primary text-primary-foreground block w-full rounded px-2 py-1 text-start text-sm"
                    : "hover:bg-muted block w-full rounded px-2 py-1 text-start text-sm"
                }
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onAnswer(fallbackFor(decision))}
          className="border-border rounded-md border px-4 py-2 text-sm font-semibold"
        >
          {t("decisionCancel")}
        </button>
        <button
          type="button"
          disabled={decision.kind !== "injury-sub" && off == null}
          onClick={() =>
            onAnswer(
              decision.kind === "injury-sub"
                ? { kind: "injury-sub", ...base, on }
                : { kind: decision.kind, ...base, off, on },
            )
          }
          className="bg-primary text-primary-foreground rounded-md px-5 py-2 text-sm font-bold disabled:opacity-50"
        >
          {t("decisionConfirm")}
        </button>
      </div>
    </>
  );
}
