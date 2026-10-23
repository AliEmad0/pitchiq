"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { type Crest, crestOf } from "@/features/game/domain/coach";
import type { CareerMode, RecordsSummary } from "@/features/game/domain/records";
import { loadProfile } from "@/features/game/storage/profile-slot";
import { loadRecords } from "@/features/game/view/records-load";
import { Link } from "@/i18n/navigation";
import { localizeDigits } from "@/utils/format";
import { CrestBadge } from "./CrestBadge";

/**
 * TASK-1812 — the Records page, in the owner's pick: **#1 Career Programme** (2026-10-23). A
 * matchday-programme spread about the coach — a cover band with his crest, the eight records as
 * the feature page, and the career log as the fixture list, filterable by mode.
 *
 * ⚠️ Everything is read after mount: the route is `force-static`, so storage can never be
 * touched during render (the TASK-M71 rule). The page renders a reserved loading block first.
 */

interface Record8 {
  k: string;
  label: string;
  value: string;
  sub: string;
  /** The detail line a tap opens. */
  line: string;
}

const dayLabel = (day: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${day}T12:00:00Z`),
  );

export function RecordsPage() {
  const t = useTranslations("gameRecords");
  const locale = useLocale();
  const [summary, setSummary] = useState<RecordsSummary | null>(null);
  const [coach, setCoach] = useState<{ name: string | null; crest: Crest }>({
    name: null,
    crest: crestOf(undefined),
  });
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<CareerMode | "all">("all");

  useEffect(() => {
    let live = true;
    void loadRecords().then((s) => {
      if (live) setSummary(s);
    });
    void loadProfile()
      .then((p) => {
        if (live) setCoach({ name: p?.name ?? null, crest: crestOf(p?.crest) });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (summary == null) {
    return (
      <div data-testid="records-loading" className="min-h-60" aria-busy="true">
        <span className="sr-only">{t("loading")}</span>
      </div>
    );
  }

  const n = (v: number | string) => localizeDigits(v, locale);
  const s = summary;
  const head = (
    <div className="rc-head">
      <CrestBadge crest={coach.crest} size={52} />
      <div className="min-w-0">
        <h1 className="rc-name">
          {coach.name ? t("coach", { name: coach.name }) : t("coachless")}
        </h1>
        <p className="rc-mut text-xs">
          {s.since
            ? t("since", { count: s.totals.played, day: dayLabel(s.since, locale) })
            : t("sinceToday", { count: s.totals.played })}
        </p>
      </div>
    </div>
  );

  if (s.empty) {
    return (
      <section data-testid="records" data-state="empty" className="rc-root">
        <div className="rc-cover">{head}</div>
        <div data-testid="records-empty" className="rc-empty">
          <b>{t("emptyTitle")}</b>
          <span className="rc-mut">{t("emptyBody")}</span>
          <Link href="/game" className="rc-cta">
            {t("emptyCta")}
          </Link>
        </div>
      </section>
    );
  }

  const tt = s.totals;
  const pct = tt.played > 0 ? Math.round((tt.won / tt.played) * 100) : 0;
  const best = s.bestRun;
  const records: Record8[] = [
    {
      k: "pct",
      label: t("winRate"),
      value: tt.played ? `${n(pct)}%` : t("none"),
      sub: tt.played
        ? t("winRateSub", { w: n(tt.won), d: n(tt.drawn), l: n(tt.lost) })
        : t("noMatches"),
      line: tt.played ? t("winRateLine", { count: tt.played, gf: n(tt.gf), ga: n(tt.ga) }) : "",
    },
    {
      k: "big",
      label: t("biggestWin"),
      // ⚠️ A scoreline stays in Western digits, the app-wide scoreline rule.
      value: s.biggestWin ? `${s.biggestWin.gf}–${s.biggestWin.ga}` : t("none"),
      sub: s.biggestWin ? t(`mode.${s.biggestWin.mode}`) : t("winOne"),
      line: s.biggestWin ? `${s.biggestWin.context} · ${dayLabel(s.biggestWin.day, locale)}` : "",
    },
    {
      k: "unb",
      label: t("unbeaten"),
      value: s.longestUnbeaten ? n(s.longestUnbeaten) : t("none"),
      sub: s.longestUnbeaten ? t("unbeatenSub") : t("none"),
      line: s.longestUnbeaten ? t("unbeatenLine") : "",
    },
    {
      k: "season",
      label: t("bestSeason"),
      value: best?.position != null ? n(best.position) : t("none"),
      sub:
        best == null
          ? t("playSeason")
          : best.position != null && best.clubs != null
            ? t("bestSeasonSub", { position: n(best.position), clubs: n(best.clubs) })
            : t(`mode.${best.mode}`),
      line:
        best == null
          ? ""
          : [
              best.context,
              best.won ? t("champions") : null,
              best.unbeaten ? t("unbeatenSeason") : null,
              best.survived === true
                ? t("survived")
                : best.survived === false
                  ? t("relegated")
                  : null,
            ]
              .filter(Boolean)
              .join(" · "),
    },
    {
      k: "ladder",
      label: t("ladderTitles"),
      value: s.ladder.weeks ? n(s.ladder.titles) : t("none"),
      sub: s.ladder.weeks
        ? t("ladderSub", {
            finish: s.ladder.bestFinish != null ? n(s.ladder.bestFinish) : t("none"),
            streak: n(s.ladder.bestTitleStreak),
          })
        : t("playWeek"),
      line: s.ladder.weeks
        ? t("ladderLine", { weeks: s.ladder.weeks, points: n(s.ladder.bestPoints) })
        : "",
    },
    {
      k: "market",
      label: t("marketBest"),
      value: s.marketBest ? n(s.marketBest.wins) : t("none"),
      sub: s.marketBest ? t("marketSub", { rounds: n(s.marketBest.rounds) }) : t("playMarket"),
      line: "",
    },
    {
      k: "daily",
      label: t("dailyStreak"),
      value: s.daily.played ? n(s.daily.currentStreak) : t("none"),
      sub: s.daily.played
        ? t("dailySub", {
            best: n(s.daily.bestStreak),
            won: n(s.daily.won),
            played: n(s.daily.played),
          })
        : t("playDaily"),
      line: s.daily.bestMargin ? t("dailyLine", { margin: n(s.daily.bestMargin) }) : "",
    },
    {
      k: "whatif",
      label: t("whatIf"),
      value: s.whatIfPlayed ? n(s.whatIfRewritten) : t("none"),
      sub: s.whatIfPlayed ? t("whatIfSub", { played: n(s.whatIfPlayed) }) : t("playWhatIf"),
      line: "",
    },
  ];

  const modes = [...new Set(s.recent.map((m) => m.mode))];
  const list = (mode === "all" ? s.recent : s.recent.filter((m) => m.mode === mode)).slice(0, 12);
  const sparse = tt.played > 0 && tt.played <= 3 && s.runs.length === 0;

  return (
    <section data-testid="records" data-state={sparse ? "sparse" : "full"} className="rc-root">
      <div className="rc-cover">
        {head}
        <p className="rc-issue">{t("issue", { count: n(tt.played) })}</p>
      </div>

      <div className="rc-feat">
        {records.map((r) => (
          <button
            key={r.k}
            type="button"
            data-testid="records-card"
            data-record={r.k}
            className="rc-card"
            aria-expanded={r.line ? open === r.k : undefined}
            disabled={!r.line}
            onClick={() => setOpen((o) => (o === r.k ? null : r.k))}
          >
            <span className="rc-k">{r.label}</span>
            <span className="rc-v">{r.value}</span>
            <span className="rc-mut rc-s">{r.sub}</span>
            {open === r.k && r.line ? (
              <span data-testid="records-line" className="rc-line">
                {r.line}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {sparse ? <p className="rc-mut mt-2 text-xs">{t("sparse")}</p> : null}

      <h2 className="rc-h">{t("fixtures")}</h2>
      {modes.length > 1 ? (
        <div className="rc-tabs" role="tablist" aria-label={t("fixtures")}>
          {(["all", ...modes] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              data-testid="records-tab"
              className="rc-tab"
              onClick={() => setMode(m)}
            >
              {m === "all" ? t("all") : t(`mode.${m}`)}
            </button>
          ))}
        </div>
      ) : null}
      {list.length === 0 ? (
        <p className="rc-mut">{t("noneInMode")}</p>
      ) : (
        <ul className="rc-log">
          {list.map((m) => (
            <li key={m.key} data-testid="records-match" className="rc-m">
              <span className={`rc-res rc-res-${m.gf > m.ga ? "w" : m.gf === m.ga ? "d" : "l"}`}>
                {m.gf > m.ga ? "W" : m.gf === m.ga ? "D" : "L"}
              </span>
              <span className="rc-score">
                {m.gf}–{m.ga}
              </span>
              <span className="rc-ctx">{m.context || t(`mode.${m.mode}`)}</span>
              <span className="rc-mut rc-when">
                {t(`mode.${m.mode}`)} · {dayLabel(m.day, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="rc-mut rc-note">{t("history")}</p>
    </section>
  );
}
