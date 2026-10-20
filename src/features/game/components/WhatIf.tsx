"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ClassicData } from "@/features/game/domain/classic-data";
import type { MatchDecision } from "@/features/game/domain/match-decisions";
import type { Side } from "@/features/game/domain/match-types";
import { SCENARIOS, verdictFor, type Scenario, type Verdict } from "@/features/game/domain/what-if";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";
import { buildFixtureSession } from "@/features/game/view/season-match";
import { randomSeed } from "@/features/game/view/seed";
import { useMatchDriver } from "@/features/game/view/use-match-driver";
import { buildBoostedSession, type WhatIfSession } from "@/features/game/view/what-if-session";
import {
  loadWhatIfBests,
  recordWhatIf,
  type WhatIfBest,
} from "@/features/game/storage/what-if-slot";
import { localizeDigits } from "@/utils/format";
import { BenchDialog } from "./BenchDialog";
import { ClubCrest } from "./ClubCrest";
import { MatchLive } from "./MatchLive";
import { MatchSummary } from "./MatchSummary";

/** What the page knows about each scenario's clubs (read from the fixture at build time). */
export interface WhatIfCard {
  id: string;
  home: { id: number; name: string };
  away: { id: number; name: string };
}

type Stage =
  | { kind: "list" }
  | { kind: "loading"; scenario: Scenario; attempt: number }
  | { kind: "error"; scenario: Scenario; attempt: number }
  | { kind: "match"; scenario: Scenario; session: WhatIfSession }
  | { kind: "summary"; scenario: Scenario; session: WhatIfSession };

const other = (s: Side): Side => (s === "home" ? "away" : "home");
const VERDICT_KEY = { rewrote: "Rewrote", matched: "Matched", repeated: "Repeated" } as const;

/**
 * TASK-1816 — What-If: step into a real Premier League collapse and rewrite it.
 *
 * Owner's picks from the 30-concept gallery, one per screen, all in #3's Arcade skin with real
 * crests: the LIST is #3 "Arcade Continue?", the TEAM TALK is #4 "VHS Rewind" (the live-radio
 * line over the real XI), the VERDICT is #3's LED full-time board.
 *
 * ⚠️ The team talk is two ENGINE decisions at the scenario's first minute — a `response` and a
 * half-time-style `sub-offer` (`MatchSetup.startState`). This screen answers both before the
 * live screen mounts, so the coach's choices ride the decision stream like every other answer.
 * ⛔ Each fetch effect owns its AbortController (the TASK-1811 effect-lifecycle rule).
 */
export function WhatIf({ cards }: { cards: readonly WhatIfCard[] }) {
  const t = useTranslations("gameWhatIf");
  const tGame = useTranslations("game");
  const locale = useLocale();
  const ld = (v: string | number) => localizeDigits(v, locale);
  const driver = useMatchDriver();
  const { startSession } = driver;
  const [stage, setStage] = useState<Stage>({ kind: "list" });
  const [bests, setBests] = useState<Record<string, WhatIfBest>>({});
  const cardOf = useCallback((id: string) => cards.find((c) => c.id === id)!, [cards]);
  // Only scenarios whose clubs the page could read — every one, today, since each is derived
  // from a real fixture; never a crash if one went missing.
  const listed = SCENARIOS.filter((s) => cards.some((c) => c.id === s.id));

  useEffect(() => {
    if (stage.kind !== "list") return;
    let live = true;
    void loadWhatIfBests().then((b) => {
      if (live) setBests(b);
    });
    return () => {
      live = false;
    };
  }, [stage.kind]);

  // Load the scenario's season (Classic's prerendered JSON) and start the session.
  const loadingKey = stage.kind === "loading" ? `${stage.scenario.id}:${stage.attempt}` : null;
  useEffect(() => {
    if (stage.kind !== "loading") return;
    const { scenario, attempt } = stage;
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/game/classic/${scenario.season}`, { signal: ac.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as ClassicData;
        if (ac.signal.aborted) return;
        const session = buildBoostedSession(scenario, data, randomSeed());
        if (session == null) throw new Error("session");
        startSession(buildFixtureSession({ setup: session.setup, coachSide: scenario.side }));
        setStage({ kind: "match", scenario, session });
      } catch {
        if (!ac.signal.aborted) setStage({ kind: "error", scenario, attempt });
      }
    })();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the attempt, not the object
  }, [loadingKey, startSession]);

  const score = (h: number, a: number) => ld(`${h}–${a}`);
  const coachName = (s: Scenario) => cardOf(s.id)[s.side].name;

  // ---------------------------------------------------------------- the list (#3)
  if (stage.kind === "list") {
    return (
      <div className="wi-root">
        <header className="wi-head">
          <h1 className="wi-title">{t("title")}</h1>
          <p className="wi-sub">{t("subtitle")}</p>
        </header>
        <section className="wi-panel" aria-label={t("listAria")}>
          <h2 className="wi-h">{t("listHeading")}</h2>
          {listed.map((s) => {
            const c = cardOf(s.id);
            const best = bests[s.id];
            const coach = c[s.side];
            const opp = c[other(s.side)];
            return (
              <div key={s.id} className="wi-row" data-testid={`wi-row-${s.id}`}>
                <ClubCrest teamId={coach.id} size={34} />
                <div className="wi-row-main">
                  <b>{coach.name}</b>{" "}
                  <span className="wi-mut">
                    v {opp.name} · {ld(s.date.slice(0, 4))}
                  </span>
                  <div className="wi-mut">
                    {t("deficit", {
                      score: score(s.startScore.home, s.startScore.away),
                      minute: ld(s.startMinute),
                    })}{" "}
                    → {t("ended", { score: score(s.history.home, s.history.away) })}
                  </div>
                </div>
                <span
                  className={`wi-chip wi-${best?.verdict ?? "none"}`}
                  data-testid="wi-chip"
                  data-verdict={best?.verdict ?? "none"}
                >
                  {best ? t(`chip${VERDICT_KEY[best.verdict]}`) : t("chipNone")}
                </span>
                <button
                  type="button"
                  className="wi-btn"
                  onClick={() => setStage({ kind: "loading", scenario: s, attempt: 0 })}
                >
                  {t("play")}
                </button>
              </div>
            );
          })}
        </section>
      </div>
    );
  }

  if (stage.kind === "loading" || stage.kind === "error") {
    return (
      <div className="wi-root">
        <div className="wi-panel" role="status">
          <p>{stage.kind === "loading" ? t("loading") : t("loadError")}</p>
          {stage.kind === "error" ? (
            <button
              type="button"
              className="wi-btn"
              onClick={() =>
                setStage({ kind: "loading", scenario: stage.scenario, attempt: stage.attempt + 1 })
              }
            >
              {t("retry")}
            </button>
          ) : null}
          <button
            type="button"
            className="wi-btn wi-ghost"
            onClick={() => setStage({ kind: "list" })}
          >
            {t("back")}
          </button>
        </div>
      </div>
    );
  }

  const { scenario: s, session } = stage;
  const { home, away, seed } = session.setup;
  const card = cardOf(s.id);
  const crests = { home: card.home.id, away: card.away.id };
  const firstMinute = s.startMinute + 1;
  const pending: MatchDecision | null = driver.pending;

  // ---------------------------------------------------------------- full time (#3's LED board)
  if (stage.kind === "summary" && driver.result != null) {
    const result = driver.result;
    const verdict: Verdict = verdictFor(s, result.score);
    const coach = coachName(s);
    return (
      <div className="wi-root">
        <section className="wi-board" data-testid="wi-verdict" data-verdict={verdict}>
          <div className="wi-board-row">{t("verdictFull")}</div>
          <div className="wi-board-score" dir="ltr">
            <ClubCrest teamId={crests.home} size={30} />
            <span>
              {home.name.toUpperCase()} {result.score.home}–{result.score.away}{" "}
              {away.name.toUpperCase()}
            </span>
            <ClubCrest teamId={crests.away} size={30} />
          </div>
          <div className="wi-board-row">
            {t("verdictHistory", { score: `${s.history.home}–${s.history.away}` })}
          </div>
          <h2 className={`wi-board-verdict wi-${verdict}`}>
            {t(`verdict${VERDICT_KEY[verdict]}`)}
          </h2>
          <p className="wi-mut">{t(`verdict${VERDICT_KEY[verdict]}Line`, { club: coach })}</p>
          <div className="wi-board-actions">
            <button
              type="button"
              className="wi-btn"
              onClick={() => setStage({ kind: "loading", scenario: s, attempt: 0 })}
            >
              {t("again")}
            </button>
          </div>
        </section>
        <MatchSummary
          homeName={home.name}
          awayName={away.name}
          score={result.score}
          decisions={driver.answers}
          coachMoves={[]}
          roster={[...session.setup[s.side].players, ...(session.setup[s.side].bench ?? [])]}
          seed={seed}
          shareCode={null}
          cardData={null}
          locale={locale}
          crests={crests}
          newMatchLabel={t("back")}
          report={{ result, home, away, coachSide: s.side }}
          onNewMatch={() => setStage({ kind: "list" })}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------- the team talk (#4)
  const talkResponse =
    pending?.kind === "response" && pending.minute === firstMinute && pending.side === s.side
      ? pending
      : null;
  const talkBench =
    pending?.kind === "sub-offer" && pending.minute === firstMinute && pending.halftime === true
      ? pending
      : null;

  if (talkResponse != null || talkBench != null) {
    const coach = coachName(s);
    const team = session.setup[s.side];
    const rows = Math.max(...team.formation.slots.map((sl) => sl.row));
    return (
      <div className="wi-root">
        <section className="wi-panel wi-vhs" data-testid="wi-talk">
          <div className="wi-mut">{t("talkLive", { date: ld(s.date) })}</div>
          <h2 className="wi-radio">
            {t("talkRadio", {
              score: score(s.startScore.home, s.startScore.away),
              minute: ld(s.startMinute),
              club: coach,
            })}
          </h2>
          <div className="wi-talk-meta">
            <span className="wi-chip">{t("talkLeft", { minutes: ld(90 - s.startMinute) })}</span>
            <span className="wi-chip" data-testid="wi-xi-source">
              {session.xiSource[s.side] === "real" ? t("xiReal") : t("xiBest")}
            </span>
          </div>
          <div
            className="wi-pitch"
            dir="ltr"
            role="img"
            aria-label={t("talkPitchAria", { club: coach })}
          >
            {team.players.map((p, i) => {
              const slot = team.formation.slots[i]!;
              const inRow = team.formation.slots.filter((x) => x.row === slot.row);
              const col = inRow.indexOf(slot);
              const top = 92 - ((slot.row - 1) / Math.max(1, rows - 1)) * 76;
              const left = ((col + 0.5) / inRow.length) * 100;
              return (
                <div
                  key={p.playerId}
                  className="wi-dot"
                  data-testid="wi-pitch-player"
                  style={{ top: `${top}%`, left: `${left}%` }}
                >
                  <i />
                  {p.name.split(" ").slice(-1)[0]}
                </div>
              );
            })}
          </div>
          <h3 className="wi-h">{t("talkHeading", { club: coach })}</h3>
          <p className="wi-mut">{t("talkHint")}</p>
          {talkResponse != null ? (
            <div className="wi-resp">
              {(["overload", "stabilize", "hold"] as const).map((choice) => {
                const key =
                  choice === "overload"
                    ? "Overload"
                    : choice === "stabilize"
                      ? "Stabilize"
                      : "Hold";
                return (
                  <button
                    key={choice}
                    type="button"
                    className="wi-opt"
                    onClick={() =>
                      driver.answer({
                        kind: "response",
                        minute: talkResponse.minute,
                        side: talkResponse.side,
                        choice,
                      })
                    }
                  >
                    <b>{tGame(`decision${key}`)}</b>
                    <span className="wi-mut">{tGame(`decision${key}Hint`)}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>
        {talkBench != null ? (
          <BenchDialog
            legalOff={talkBench.legalOff}
            legalOn={talkBench.legalOn}
            maxChanges={talkBench.maxChanges}
            captainId={null}
            onConfirm={(off, on, changes) =>
              driver.answer({
                kind: "sub-offer",
                minute: talkBench.minute,
                side: talkBench.side,
                off,
                on,
                changes,
              })
            }
            onClose={() =>
              driver.answer({ kind: "sub-offer", minute: talkBench.minute, side: talkBench.side })
            }
          />
        ) : null}
      </div>
    );
  }

  // ---------------------------------------------------------------- live
  return (
    <WhatIfLive
      scenario={s}
      session={session}
      crests={crests}
      driver={driver}
      onFullTime={() => {
        if (driver.result == null) return;
        void recordWhatIf(s, driver.result.score);
        setStage({ kind: "summary", scenario: s, session });
      }}
    />
  );
}

function WhatIfLive({
  scenario,
  session,
  crests,
  driver,
  onFullTime,
}: {
  scenario: Scenario;
  session: WhatIfSession;
  crests: { home: number; away: number };
  driver: ReturnType<typeof useMatchDriver>;
  onFullTime: () => void;
}) {
  const { home, away, seed } = session.setup;
  const model = useMemo(
    () =>
      buildMatchViewModel(home, away, { events: driver.events, score: { home: 0, away: 0 }, seed }),
    [home, away, seed, driver.events],
  );
  return (
    <MatchLive
      coachSide={scenario.side}
      startMinute={scenario.startMinute}
      model={model}
      teams={{ home, away }}
      pending={driver.pending}
      holdAt={driver.pending?.minute}
      captaincies={{}}
      referees={[]}
      crests={crests}
      onAnswer={driver.answer}
      onFullTime={onFullTime}
    />
  );
}
