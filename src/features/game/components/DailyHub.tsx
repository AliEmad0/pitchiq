"use client";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { pickBack } from "@/features/game/domain/card-design";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { msToNextUtcDay } from "@/features/game/domain/daily";
import {
  recentOutcomes,
  type DailyOutcome,
  type DailyStats,
} from "@/features/game/domain/daily-stats";
import { roomDeals } from "@/features/game/domain/draft-room";
import type { Formation } from "@/features/game/domain/formation";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { createRoomState, isRoomComplete, roomReducer } from "@/features/game/view/room-state";
import { localizeDigits } from "@/utils/format";
import { prefersReducedMotion } from "@/utils/motion";
import { CardBack, PlayerCard } from "./PlayerCard";

/** How many days the heat calendar shows. Four clean weeks. */
const HEAT_DAYS = 28;

interface Props {
  pool: PoolCard[];
  /** Today's key, resolved once after mount by the container. */
  today: string;
  dayNumber: number;
  formation: Formation;
  /** The day's DEAL seed — the same hands for every coach on earth today. */
  seed: number;
  stats: DailyStats;
  history: readonly DailyOutcome[];
  onComplete: (cardIds: PlayerSeasonId[]) => void;
}

/** hh:mm:ss, zero-padded, in the reader's digits. */
function clockText(ms: number, locale: string): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const parts = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  return parts.map((v) => localizeDigits(String(v).padStart(2, "0"), locale)).join(":");
}

/**
 * The daily hub — "Arcade Cabinet", the owner's pick from the 30-concept ritual
 * (TASK-1836), refined over three rounds.
 *
 * Reading order is his: the cabinet marquee carries the CLOSING CLOCK above DAY · STREAK;
 * the Gazette sits directly beneath it; the trophy strip, the pitch and a full-width heat
 * calendar follow. Picking happens in a FULL-SCREEN overlay — one position at a time,
 * five cards dealt face-down on their real backs and flipped over — which closes itself
 * on the eleventh pick and hands the XI up.
 *
 * ⚠️ The room's STATE MACHINE is reused as-is (`roomReducer` + `roomDeals`): the hands are
 * computed once from `(pool, formation, seed)` and `pick` advances to the next unfilled
 * slot on its own. This component is a second PRESENTATION of that machine, never a second
 * copy of it — two deal implementations would diverge and the divergence would surface as
 * a stored challenge that replays into a different squad.
 */
export function DailyHub({
  pool,
  today,
  dayNumber,
  formation,
  seed,
  stats,
  history,
  onComplete,
}: Props) {
  const t = useTranslations("game");
  const locale = useLocale();
  const reduced = prefersReducedMotion();
  const n = (v: number) => localizeDigits(v, locale);

  /**
   * ⛔ Standout + one-per-player + final picks, matching what the screen SAYS.
   *
   * The overlay tells the coach "one is rated 80 or better" and "this pick is final", so
   * the deal has to guarantee both — copy that outruns the rules is a lie the coach can
   * check. Finality needs no flag here: the overlay only ever offers the next UNFILLED
   * slot, so a filled one cannot be reopened.
   */
  const hands = useMemo(
    () => roomDeals(pool, formation, seed, { standout: true, onePerPlayer: true }),
    [pool, formation, seed],
  );
  const [room, dispatch] = useReducer(roomReducer, formation, createRoomState);
  const byId = useMemo(() => new Map(pool.map((c) => [c.cardId, c])), [pool]);

  /** Is the overlay up? Opened by the coach, closed by the eleventh pick. */
  const [picking, setPicking] = useState(false);
  /** The slot filled most recently — the only card that flips onto the pitch. */
  const [lastFilled, setLastFilled] = useState<number | null>(null);

  const filled = room.picks.filter((p) => p != null).length;
  const open = room.open;
  const complete = isRoomComplete(room);

  /**
   * The countdown to the next challenge.
   *
   * ⚠️ Ticks in state, started AFTER mount. `/game/daily` is `force-static`, so a clock
   * read during render would bake one visitor's remaining time into the CDN copy.
   */
  const [msLeft, setMsLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setMsLeft(msToNextUtcDay(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  /**
   * Hand the XI up once, and close the overlay on the way out.
   *
   * ⚠️ Guarded with a ref for the reason `DraftRoom` is: `isRoomComplete` stays true for
   * every later render, and handing off twice would start two matches.
   */
  const handedOff = useRef(false);
  useEffect(() => {
    if (handedOff.current || !complete) return;
    handedOff.current = true;
    setPicking(false);
    onComplete(room.picks as PlayerSeasonId[]);
  }, [complete, room.picks, onComplete]);

  const heat = useMemo(() => recentOutcomes(history, today, HEAT_DAYS), [history, today]);
  const rows = Math.max(...formation.slots.map((s) => s.row));

  const pick = (index: number, cardId: PlayerSeasonId) => {
    setLastFilled(index);
    dispatch({ type: "pick", index, cardId });
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* ── the cabinet marquee: the clock, then the day and the streak ── */}
      <div className="dh-marquee">
        {/* ⚠️ Keeps `daily-header`: several tests use it as "the day resolved and is NOT
            spent", which is behaviour the redesign did not change. */}
        <h1 data-testid="daily-header" className="dh-marquee-title">
          {t("dailyMarqueeTitle")}
        </h1>
        <p className="dh-closes">{t("dailyClosesIn")}</p>
        <p className="dh-clock" data-testid="daily-countdown">
          {msLeft == null ? "—" : clockText(msLeft, locale)}
        </p>
        <div className="dh-figures">
          <div>
            <span className="dh-figure-label">{t("dailyDayLabel")}</span>
            <span className="dh-figure" data-testid="daily-day">
              {n(dayNumber)}
            </span>
          </div>
          <span className="dh-figure-dot" aria-hidden>
            ·
          </span>
          <div>
            <span className="dh-figure-label">{t("dailyStreakLabel")}</span>
            <span className="dh-figure">{n(stats.currentStreak)}</span>
          </div>
        </div>
      </div>

      {/* ── the Gazette, directly beneath the marquee ── */}
      <section className="dh-gazette" aria-label={t("dailyGazetteAria")}>
        <p className="dh-mast">{t("dailyGazetteMast", { n: n(dayNumber), day: today })}</p>
        <h2 className="dh-headline">{t("dailyGazetteHeadline", { shape: formation.name })}</h2>
        <p className="dh-lede">
          {t("dailyGazetteLede", { streak: n(stats.currentStreak), best: n(stats.bestStreak) })}
        </p>
      </section>

      {/* ── the shelf, as a strip ── */}
      <div className="dh-shelf" data-testid="daily-shelf">
        <span className="dh-trophy" aria-hidden>
          🏆
        </span>
        <span>
          <b className="dh-shelf-num dh-gold">{n(stats.bestStreak)}</b>
          <span className="dh-shelf-label">{t("dailyBestStreak")}</span>
        </span>
        <span className="dh-shelf-sep" aria-hidden>
          |
        </span>
        <span>
          <b className="dh-shelf-num dh-lime">{n(stats.currentStreak)}</b>
          <span className="dh-shelf-label">{t("dailyOnTheRun")}</span>
        </span>
        <span className="dh-shelf-sep" aria-hidden>
          |
        </span>
        <span>
          <b className="dh-shelf-num">{n(stats.played)}</b>
          <span className="dh-shelf-label">{t("dailyDaysPlayed")}</span>
        </span>
      </div>

      {/* ── the pitch: every pick lands here, the newest one flipping in ── */}
      <div className="dh-cabinet">
        <div className="dh-pitch" role="img" aria-label={t("dailyPitchAria")}>
          <span className="dh-line dh-mid" aria-hidden />
          <span className="dh-line dh-circle" aria-hidden />
          <span className="dh-line dh-box dh-box-left" aria-hidden />
          <span className="dh-line dh-box dh-box-right" aria-hidden />
          {formation.slots.map((s, i) => {
            const inRow = formation.slots.filter((x) => x.row === s.row).length;
            const held = room.picks[i];
            const card = held != null ? byId.get(held) : undefined;
            const style = {
              left: `${rows === 1 ? 50 : 8 + ((s.row - 1) / (rows - 1)) * 76}%`,
              top: `${(s.col / (inRow + 1)) * 100}%`,
            };
            return (
              <span key={`${s.row}-${s.col}`} className="dh-spot" style={style}>
                {card ? (
                  <span className={`dh-mini${lastFilled === i && !reduced ? " dh-mini-flip" : ""}`}>
                    <PlayerCard card={card as EnrichedCard} reduced={reduced} interactive={false} />
                  </span>
                ) : (
                  <span className="dh-empty">{s.role}</span>
                )}
              </span>
            );
          })}
        </div>
      </div>

      {/* ── the coin slot: open the overlay and keep picking ── */}
      {open != null ? (
        <div className="dh-slotbar">
          <p className="dh-insert">{t("dailyInsertXi", { n: n(dayNumber) })}</p>
          <button type="button" onClick={() => setPicking(true)} className="dh-start">
            {filled === 0
              ? t("dailyStartPicking", { role: formation.slots[open].role })
              : t("dailyContinuePicking", {
                  role: formation.slots[open].role,
                  n: n(filled + 1),
                  total: n(formation.slots.length),
                })}
          </button>
        </div>
      ) : null}

      {/* ── the month, full width ── */}
      <section className="dh-month" aria-label={t("dailyMonthAria")}>
        <p className="dh-month-label">{t("dailyThisMonth")}</p>
        <div className="dh-month-grid" data-testid="daily-heat">
          {heat.map((d) => (
            <span key={d.day} className={`dh-day dh-day-${d.state}`} title={d.day}>
              {n(Number(d.day.slice(-2)))}
            </span>
          ))}
        </div>
      </section>

      {/* ── the full-screen pick overlay ── */}
      {picking && open != null ? (
        <div
          className="dh-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t("dailyPickTitle", { role: formation.slots[open].role })}
        >
          <div className="dh-overlay-inner">
            <p className="dh-overlay-meta">
              {t("dailyPickOf", {
                day: n(dayNumber),
                shape: formation.name,
                n: n(filled + 1),
                total: n(formation.slots.length),
              })}
            </p>
            <h2 className="dh-overlay-role">
              {t("dailyPickTitle", { role: formation.slots[open].role })}
            </h2>
            <p className="dh-overlay-sub">{t("dailyPickSub")}</p>

            <div className="dh-dots">
              {formation.slots.map((s, i) => (
                <span
                  key={`${s.row}-${s.col}`}
                  aria-hidden
                  className={`dh-dot${room.picks[i] != null ? " dh-dot-done" : i === open ? " dh-dot-now" : ""}`}
                >
                  {s.role}
                </span>
              ))}
            </div>

            <div className="dh-hand">
              {hands[open].map((c, k) => (
                <button
                  key={c.cardId}
                  type="button"
                  aria-label={t("pitchChooseCard", {
                    name: c.name,
                    role: c.role ?? "",
                    ovr: n(c.ratings?.overall ?? 0),
                  })}
                  onClick={() => pick(open, c.cardId)}
                  className="dh-pick"
                >
                  <span
                    className={reduced ? "dh-flip dh-flip-still" : "dh-flip"}
                    style={reduced ? undefined : { animationDelay: `${k * 120}ms` }}
                  >
                    <span className="dh-face">
                      {/* ⚠️ Face only — the tile is already a button, and a card that is
                          its own button nested inside it is ejected by the parser. */}
                      <PlayerCard card={c as EnrichedCard} reduced={reduced} interactive={false} />
                    </span>
                    <span className="dh-back" aria-hidden>
                      <CardBack card={c as EnrichedCard} back={pickBack(c as EnrichedCard)} />
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <p className="dh-overlay-hint">{t("dailyPickHint")}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
