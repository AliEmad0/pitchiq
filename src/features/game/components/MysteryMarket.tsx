"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import {
  LIVES,
  MARKET_SHAPE,
  marketMatch,
  type MarketRun,
  packFor,
  recordMatch,
  runOver,
  sideFor,
  startRun,
  takeReward,
} from "@/features/game/domain/market";
import type { MatchResult } from "@/features/game/domain/match-types";
import {
  clearMarketRun,
  loadMarketBest,
  loadMarketRun,
  type MarketBest,
  offerMarketBest,
  saveMarketRun,
} from "@/features/game/storage/market-slot";
import type { SeasonFixture } from "@/features/game/view/season-match";
import { randomSeed } from "@/features/game/view/seed";
import {
  localDay,
  matchEntry,
  recordFullTime,
  scoreLine,
} from "@/features/game/view/trophy-record";
import { useCraftedTraits } from "@/features/game/view/use-crafted-traits";
import { localizeDigits } from "@/utils/format";
import { PackTable } from "./PackTable";
import { SeasonFixturePlay } from "./SeasonFixturePlay";

/**
 * TASK-1818 — the Mystery Market (owner, 2026-10-21): "opening a high-stakes loot pack —
 * suspenseful, rewarding, full of tactical potential … a huge boost with a risky catch, making
 * the player instantly want to test their new setup in the next match."
 *
 * Hub → match (the shared season match screens) → after a win, THE PACK: three face-down cards
 * on the app's own `CardBack`, opened together, each showing its boon and its catch; you keep one.
 *
 * The pack is `PackTable`: the owner's Three-Card Table layout with the Triple Flip reveal.
 */
export function MysteryMarket({ pool }: { pool: PoolCard[] }) {
  const t = useTranslations("gameMarket");
  const locale = useLocale();
  const n = (v: number) => localizeDigits(v, locale);
  const crafted = useCraftedTraits();
  const [loaded, setLoaded] = useState(false);
  const [run, setRun] = useState<MarketRun | null>(null);
  const [best, setBest] = useState<MarketBest | null>(null);
  const [playing, setPlaying] = useState<SeasonFixture | null>(null);
  const [saveError, setSaveError] = useState(false);
  const committing = useRef(false);
  const ids = useMemo(() => new Map<string, PoolCard>(pool.map((c) => [c.cardId, c])), [pool]);

  useEffect(() => {
    let live = true;
    void Promise.all([loadMarketRun(), loadMarketBest()]).then(([r, b]) => {
      if (!live) return;
      // A stored run whose cards left the pool cannot be played on; it is set aside, not faked.
      setRun(r != null && r.xi.every((id) => ids.has(id)) ? r : null);
      setBest(b);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [ids]);

  const persist = async (next: MarketRun): Promise<boolean> => {
    try {
      await saveMarketRun(next);
      setSaveError(false);
      setRun(next);
      if (runOver(next)) {
        const improved = await offerMarketBest({
          wins: next.wins,
          rounds: next.round,
          endedAt: new Date().toISOString(),
        });
        if (improved) setBest(await loadMarketBest());
      }
      return true;
    } catch {
      setSaveError(true);
      return false;
    }
  };

  const names = (r: MarketRun) => ({
    coach: t("yourSide"),
    opponent: t("opponent", { n: n(r.round + 1) }),
  });

  if (!loaded) return <div className="min-h-40" aria-busy="true" data-testid="market-loading" />;

  // ── a match in progress ──
  if (playing != null && run != null) {
    const coachSide = playing.coachSide;
    return (
      <SeasonFixturePlay
        fixture={playing}
        crests={{ home: -1, away: -1 }}
        captaincies={{}}
        referees={[]}
        crafted={crafted}
        returnLabel={t("back")}
        onReturn={(result: MatchResult | null) => {
          if (result == null) {
            setPlaying(null);
            return;
          }
          if (committing.current) return;
          committing.current = true;
          const gf = result.score[coachSide];
          const ga = result.score[coachSide === "home" ? "away" : "home"];
          const next = recordMatch(run, gf, ga);
          const fixture = playing;
          void persist(next).then((ok) => {
            committing.current = false;
            if (!ok) return;
            setPlaying(null);
            const { home, away } = fixture.setup;
            void recordFullTime(
              matchEntry({
                key: `k:${run.seed}:${run.round}`,
                day: localDay(),
                players: fixture.setup[coachSide].players,
                result,
                coachSide,
                context: scoreLine(home.name, away.name, result.score),
              }),
            );
          });
        }}
      />
    );
  }

  const header = (
    <header className="mm-head">
      <h1 className="mm-title">{t("title")}</h1>
      <p className="mm-sub">{t("subtitle", { lives: n(LIVES) })}</p>
      <p className="mm-best" data-testid="market-best">
        {best == null ? t("noBest") : t("best", { wins: n(best.wins), rounds: n(best.rounds) })}
      </p>
    </header>
  );

  // ── no run, or the run is over ──
  if (run == null || runOver(run)) {
    return (
      <div className="mm-root" data-testid="market-intro">
        {header}
        {run != null ? (
          <section className="mm-over" data-testid="market-over">
            <h2 className="mm-h">{t("over")}</h2>
            <p>{t("overLine", { wins: n(run.wins), rounds: n(run.round) })}</p>
          </section>
        ) : null}
        <button
          type="button"
          className="mm-go"
          data-testid="market-start"
          onClick={() => {
            void clearMarketRun().then(() => persist(startRun(pool, randomSeed())));
          }}
        >
          {run == null ? t("start") : t("again")}
        </button>
        {saveError ? <p role="alert">{t("saveError")}</p> : null}
      </div>
    );
  }

  // ── the pack ──
  if (run.pendingPack) {
    const pack = packFor(run);
    return (
      <div className="mm-root" data-testid="market-pack">
        {header}
        <PackTable
          key={`${run.seed}:${run.round}`}
          pack={pack}
          // Any pool card lends its seeded back — the app's own artwork, never a hand-drawn panel.
          backs={pack.map(
            (_, i) => pool[(run.seed + run.round * 7 + i) % pool.length] as EnrichedCard,
          )}
          onTake={(id) => {
            void persist(takeReward(pool, run, id));
          }}
        />
        {saveError ? <p role="alert">{t("saveError")}</p> : null}
      </div>
    );
  }

  // ── the hub ──
  const shape = formationByName(MARKET_SHAPE);
  const live = run.buffs.filter((b) => b.until == null || run.round < b.until);
  return (
    <div className="mm-root" data-testid="market-hub">
      {header}
      <div className="pk-hub">
        <section className="pk-bx">
          <div className="mm-status">
            <span
              className="mm-lives"
              data-testid="market-lives"
              aria-label={t("livesAria", { n: n(run.lives) })}
            >
              {"♥".repeat(run.lives)}
              <span className="mm-lost">{"♥".repeat(LIVES - run.lives)}</span>
            </span>
            <span data-testid="market-wins">{t("wins", { n: n(run.wins) })}</span>
            <span>{t("round", { n: n(run.round + 1) })}</span>
          </div>
          {live.length > 0 || Object.keys(run.forced).length > 0 ? (
            <ul className="mm-effects" data-testid="market-effects">
              {live.map((b, i) => (
                <li key={`${b.id}:${i}`}>
                  {t(`reward.${b.id}.name`)}
                  {b.until == null ? "" : ` · ${t("matchesLeft", { n: n(b.until - run.round) })}`}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mm-sub">{t(sideFor(run.round) === "home" ? "nextHome" : "nextAway")}</p>
          <button
            type="button"
            className="mm-go pk-play"
            data-testid="market-play"
            disabled={saveError}
            onClick={() => {
              const m = marketMatch(pool, run, names(run), crafted);
              setPlaying(m);
            }}
          >
            {t("play", { n: n(run.round + 1) })}
          </button>
        </section>
        <section className="pk-bx">
          <h2 className="mm-h">{t("squad")}</h2>
          <ol className="mm-squad">
            {run.xi.map((id, i) => {
              const c = ids.get(id)!;
              const forced = run.forced[id];
              return (
                <li key={id}>
                  <span className="mm-role">{shape.slots[i]!.role}</span> {c.name}{" "}
                  <span className="mm-ovr">{n(c.ratings?.overall ?? 0)}</span>
                  {forced != null ? (
                    <span className="mm-forced">
                      {" "}
                      · {t(`forced.${forced === "hot-head" ? "hotHead" : forced}`)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
      {saveError ? <p role="alert">{t("saveError")}</p> : null}
    </div>
  );
}
