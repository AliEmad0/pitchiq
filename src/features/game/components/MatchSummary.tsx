"use client";
import { useTranslations } from "next-intl";
import type { DecisionAnswer } from "@/features/game/domain/match-decisions";
import type { GamePlayer } from "@/features/game/domain/player";
import type { SummaryCardData } from "@/features/game/domain/summary-card";
import { splitDecisions } from "@/features/game/view/decision-summary";
import { localizeDigits } from "@/utils/format";
import { ClubCrest } from "./ClubCrest";
import { ShareLink } from "./ShareLink";
import { SummaryCard } from "./SummaryCard";

interface Props {
  newMatchLabel?: string;
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
  /**
   * Everyone a decision can name — the coach's XI AND his bench (owner round 2, 2026-08-19).
   *
   * ⛔ The bench half is not optional. A substitution's `on` is BY DEFINITION someone who
   * was not on the pitch, so a roster of starters alone resolves the man going off and
   * leaves the man coming on as a bare id.
   *
   * Absent = the shipped behaviour, a bare "Substitution" with no names.
   */
  roster?: readonly GamePlayer[];
  seed: number;
  /** The link that replays this match, or null while one cannot be built. */
  shareCode: string | null;
  /** What the downloadable card says. Null alongside a null `shareCode`. */
  cardData: SummaryCardData | null;
  locale: string;
  /**
   * The route this match replays on — where "Copy link" points.
   *
   * Absent = the canonical `/game/draft`, which is right for the packs served there and
   * wrong for every pack with its own pool. See `view/share-link.ts#shareUrl`.
   */
  sharePath?: string;
  /** The two clubs' ids, for their crests. See `MatchLive`'s prop of the same name. */
  crests?: { home: number | null; away: number | null };
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
  newMatchLabel,
  homeName,
  awayName,
  score,
  decisions,
  coachMoves,
  roster,
  seed,
  shareCode,
  cardData,
  locale,
  sharePath,
  crests,
  shared = false,
  drifted = false,
  onNewMatch,
}: Props) {
  const t = useTranslations("game");
  const derived = splitDecisions(decisions);
  const taken = coachMoves ?? derived.taken;
  // A declined-offer count is meaningless once the engine is answering for him.
  const declined = coachMoves != null ? 0 : derived.declined;

  /**
   * Who a decision actually named (owner round 2, 2026-08-19).
   *
   * ⛔ The screen used to say "80' Substitution" and nothing else — the coach could not
   * tell which change he had made, let alone whether it was the right one. A decision is
   * only legible as the two men it swapped.
   *
   * ⚠️ A missing id is rendered as a LABEL, never skipped. A row that silently dropped
   * half a substitution would read as a change that only took a player off.
   */
  const byId = new Map((roster ?? []).map((p) => [p.playerId, p]));
  const nameOf = (playerId: number | undefined) => {
    if (playerId == null) return null;
    const p = byId.get(playerId);
    return {
      name: p?.name ?? t("decisionUnknownPlayer"),
      ovr: p?.ratings?.overall ?? null,
    };
  };
  /** The men a single answer moved, in the order a match report would list them. */
  const partsOf = (
    d: DecisionAnswer,
  ): Array<{ key: string; label: string; who: NonNullable<ReturnType<typeof nameOf>> }> => {
    const out: Array<{ key: string; label: string; who: NonNullable<ReturnType<typeof nameOf>> }> =
      [];
    // ⛔ No roster, no detail — the shipped packs pass none and must render exactly the row
    // they always did. Falling through would print "Off unnamed —" on every one of them.
    if (roster == null) return out;
    const push = (key: string, label: string, playerId: number | undefined) => {
      const who = nameOf(playerId);
      if (who != null) out.push({ key, label, who });
    };
    if (d.kind === "sub-offer" || d.kind === "dismissal") {
      push("off", t("decisionWentOff"), d.off);
      push("on", t("decisionCameOn"), d.on);
    }
    if (d.kind === "injury-sub") push("on", t("decisionCameOn"), d.on);
    // ⛔ `inGoal` is mutually exclusive with off/on — an outfielder taking the gloves is
    // the OTHER answer to a dismissal, never a third field alongside a substitution.
    if (d.kind === "dismissal") push("gk", t("decisionInGoal"), d.inGoal);
    return out;
  };

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
        <span className="flex flex-1 items-center justify-end gap-2.5 text-end text-lg font-bold text-white">
          <ClubCrest teamId={crests?.home} size={34} />
          {homeName}
        </span>
        {/* ⛔ WESTERN in every locale (owner, 2026-08-24), and the card painted directly
            below now matches. A scoreline is read as a glyph rather than as prose — the
            decision already pinned for the player cards (PR #97) and the commentary — and
            this screen was the last one disagreeing with it: the live feed printed `0–1`
            and full time answered `٠–١` for the same match one click later. */}
        <span className="font-mono text-3xl font-black tabular-nums text-cyan-300">
          {score.home}
          {"–"}
          {score.away}
        </span>
        <span className="flex flex-1 items-center justify-start gap-2.5 text-start text-lg font-bold text-white">
          {awayName}
          <ClubCrest teamId={crests?.away} size={34} />
        </span>
      </div>

      {cardData != null ? (
        <>
          <h2 className="text-muted-foreground mb-2 font-mono text-[11px] font-bold tracking-widest uppercase">
            {t("shareTitle")}
          </h2>
          <SummaryCard data={cardData} />
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
            {taken.map((d, i) => {
              const parts = partsOf(d);
              return (
                <li
                  key={`${d.kind}-${d.minute}-${i}`}
                  data-testid="decision-row"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm"
                >
                  <span className="text-muted-foreground w-10 shrink-0 font-mono tabular-nums">
                    {/* Western, like every other minute in the match. */}
                    {d.minute}
                    {"'"}
                  </span>
                  <span className="font-semibold">
                    {d.kind === "response"
                      ? t(CHOICE_KEY[d.choice])
                      : t(`decision${label(d.kind)}`)}
                  </span>
                  {parts.map((p) => (
                    <span key={p.key} className="flex items-center gap-1.5">
                      <span className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
                        {p.label}
                      </span>
                      <span>{p.who.name}</span>
                      {/* ⛔ Western: a rating is one of the four quantities pinned to
                          Western in every locale, and the team sheet this coach just left
                          printed the same number that way. */}
                      <span className="rounded bg-cyan-400/10 px-1.5 font-mono text-xs font-bold text-cyan-300 tabular-nums">
                        {p.who.ovr ?? "—"}
                      </span>
                    </span>
                  ))}
                </li>
              );
            })}
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
          {/* ⚠️ Western: the seed is an IDENTIFIER, read against the share link and the
              card footer beside it, both of which are Latin. */}
          {t("playSeed")} {seed}
        </span>
        {shareCode != null ? <ShareLink code={shareCode} locale={locale} path={sharePath} /> : null}
        <button
          type="button"
          onClick={onNewMatch}
          className="bg-primary text-primary-foreground ms-auto rounded-md px-5 py-2 text-sm font-bold"
        >
          {newMatchLabel ?? t("playNewMatch")}
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
