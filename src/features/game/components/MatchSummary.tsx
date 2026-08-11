"use client";
import { useTranslations } from "next-intl";
import type { DecisionAnswer } from "@/features/game/domain/match-decisions";

interface Props {
  homeName: string;
  awayName: string;
  score: { home: number; away: number };
  /** What the coach actually chose, in the order the engine asked. */
  decisions: DecisionAnswer[];
  seed: number;
  onNewMatch: () => void;
}

const CHOICE_KEY: Record<string, string> = {
  overload: "decisionOverload",
  stabilize: "decisionStabilize",
  hold: "decisionHold",
};

/**
 * Full time.
 *
 * Shows the decisions the coach took alongside the scoreline, because a match he
 * intervened in should not read the same as one he watched. The seed is here too:
 * `(setup, seed, decisions[])` replays this match byte-for-byte, which is what the
 * sharing and records work in TASK-1812 will build on.
 */
export function MatchSummary({
  homeName,
  awayName,
  score,
  decisions,
  seed,
  onNewMatch,
}: Props) {
  const t = useTranslations("game");

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("playFullTime")}</h1>

      <div className="my-6 flex items-center justify-center gap-6 rounded-2xl bg-[radial-gradient(120%_80%_at_50%_-10%,#12202c,#060a0f)] p-8 ring-1 ring-cyan-400/20">
        <span className="flex-1 text-end text-lg font-bold text-white">{homeName}</span>
        <span className="font-mono text-3xl font-black tabular-nums text-cyan-300">
          {score.home}
          {"–"}
          {score.away}
        </span>
        <span className="flex-1 text-start text-lg font-bold text-white">{awayName}</span>
      </div>

      <h2 className="text-muted-foreground mb-2 font-mono text-[11px] font-bold tracking-widest uppercase">
        {t("playDecisionsTaken")}
      </h2>
      {decisions.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("playNoDecisions")}</p>
      ) : (
        <ul className="divide-border/60 divide-y">
          {decisions.map((d, i) => (
            <li key={`${d.kind}-${d.minute}-${i}`} className="flex items-center gap-3 py-1.5 text-sm">
              <span className="text-muted-foreground w-10 shrink-0 font-mono tabular-nums">
                {d.minute}
                {"'"}
              </span>
              <span className="font-semibold">
                {d.kind === "response" ? t(CHOICE_KEY[d.choice]) : t(`decision${label(d.kind)}`)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex items-center gap-3">
        <span className="text-muted-foreground font-mono text-xs">
          {t("playSeed")} {seed}
        </span>
        <button
          type="button"
          onClick={onNewMatch}
          className="bg-primary text-primary-foreground ms-auto rounded-md px-5 py-2 text-sm font-bold"
        >
          {t("playNewMatch")}
        </button>
      </div>
    </div>
  );
}

/** `sub-offer` → `SubTitle`, so the existing prompt titles are reused rather than duplicated. */
function label(kind: DecisionAnswer["kind"]): string {
  if (kind === "sub-offer") return "SubTitle";
  if (kind === "injury-sub") return "InjuryTitle";
  return "DismissalTitle";
}
