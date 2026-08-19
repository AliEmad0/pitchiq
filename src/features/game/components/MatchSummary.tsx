"use client";
import { useTranslations } from "next-intl";
import type { DecisionAnswer } from "@/features/game/domain/match-decisions";
import type { SummaryCardData } from "@/features/game/domain/summary-card";
import { splitDecisions } from "@/features/game/view/decision-summary";
import { localizeDigits } from "@/utils/format";
import { ShareLink } from "./ShareLink";
import { SummaryCard } from "./SummaryCard";

interface Props {
  homeName: string;
  awayName: string;
  score: { home: number; away: number };
  /** Every answer in the replay stream, coach-made or engine-made. */
  decisions: DecisionAnswer[];
  /**
   * Only what the COACH chose himself.
   *
   * WARNING: when present this REPLACES the derivation from `decisions`. In auto mode the
   * engine answers most offers with its own recommendation, and those land in the replay
   * stream looking exactly like a coach's — which is how this screen came to list five
   * substitutions for a match the coach never touched. The shipped packs pass nothing and
   * keep the old behaviour, because there every answer really is his.
   */
  coachMoves?: DecisionAnswer[];
  seed: number;
  /** The link that replays this match, or null while one cannot be built. */
  shareCode: string | null;
  /** What the downloadable card says. Null alongside a null `shareCode`. */
  cardData: SummaryCardData | null;
  locale: string;
  /** This match arrived from someone else's link. */
  shared?: boolean;
  /** Our replay differs from the sender's fingerprint. */
  drifted?: boolean;
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
  coachMoves,
  seed,
  shareCode,
  cardData,
  locale,
  shared = false,
  drifted = false,
  onNewMatch,
}: Props) {
  const t = useTranslations("game");
  const derived = splitDecisions(decisions);
  const taken = coachMoves ?? derived.taken;
  // A declined-offer count is meaningless once the engine is answering for him.
  const declined = coachMoves != null ? 0 : derived.declined;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("playFullTime")}</h1>

      {shared ? <p className="text-muted-foreground mt-1 text-sm">{t("shareWatching")}</p> : null}

      {drifted ? (
        <p
          role="status"
          className="mt-3 rounded-md bg-amber-500/10 p-3 text-sm text-amber-300 ring-1 ring-amber-400/30"
        >
          {t("shareDrift")}
        </p>
      ) : null}

      <div className="my-6 flex items-center justify-center gap-6 rounded-2xl bg-[radial-gradient(120%_80%_at_50%_-10%,#12202c,#060a0f)] p-8 ring-1 ring-cyan-400/20">
        <span className="flex-1 text-end text-lg font-bold text-white">{homeName}</span>
        {/* ⚠️ Localized digits: the card painted directly below prints ٣–١ under /ar, and
            two digit conventions for the same score on one screen is worse than either. */}
        <span className="font-mono text-3xl font-black tabular-nums text-cyan-300">
          {localizeDigits(score.home, locale)}
          {"–"}
          {localizeDigits(score.away, locale)}
        </span>
        <span className="flex-1 text-start text-lg font-bold text-white">{awayName}</span>
      </div>

      {cardData != null ? (
        <>
          <h2 className="text-muted-foreground mb-2 font-mono text-[11px] font-bold tracking-widest uppercase">
            {t("shareTitle")}
          </h2>
          <SummaryCard data={cardData} locale={locale} />
        </>
      ) : null}

      {/* Hidden entirely when he took none: a heading over "no decisions" is noise on a
          screen about what he did. */}
      {taken.length === 0 ? null : (
        <>
          <h2 className="text-muted-foreground mb-2 font-mono text-[11px] font-bold tracking-widest uppercase">
            {t("playDecisionsTaken")}
          </h2>
          <ul className="divide-border/60 divide-y">
            {taken.map((d, i) => (
              <li
                key={`${d.kind}-${d.minute}-${i}`}
                className="flex items-center gap-3 py-1.5 text-sm"
              >
                <span className="text-muted-foreground w-10 shrink-0 font-mono tabular-nums">
                  {localizeDigits(d.minute, locale)}
                  {"'"}
                </span>
                <span className="font-semibold">
                  {d.kind === "response" ? t(CHOICE_KEY[d.choice]) : t(`decision${label(d.kind)}`)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ⚠️ Counted, not hidden. A coach who turned every offer down did something, and
          omitting them entirely would say he was never asked. */}
      {declined > 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">
          {t("playOffersDeclined", { count: declined, n: localizeDigits(declined, locale) })}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="text-muted-foreground font-mono text-xs">
          {t("playSeed")} {localizeDigits(seed, locale)}
        </span>
        {shareCode != null ? <ShareLink code={shareCode} locale={locale} /> : null}
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
