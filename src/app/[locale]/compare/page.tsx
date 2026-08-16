import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  COMPARISON_METRICS,
  parseId,
  parseSlotSeason,
  type SlotSeason,
} from "@/features/players/comparison-metrics";
import { compareOgImagePath } from "@/app/api/og/compare-card";
import { DataUnavailable } from "@/components/DataUnavailable";
import { loadMarketValues } from "@/data/loaders";
import type { MarketValueFile } from "@/data/schemas";
import {
  formatMarketValue,
  marketValueForSeason,
  peakMarketValue,
} from "@/features/players/market-value";
import { ComparisonRadarLazy } from "@/features/players/components/ComparisonRadarLazy";
import { CopyCompareLink } from "@/features/players/components/CopyCompareLink";
import { PlayerSlotPicker } from "@/features/players/components/PlayerSlotPicker";
import { ShareBanner } from "@/features/players/components/ShareBanner";
import { SuggestedPlayerGrid } from "@/features/players/components/SuggestedPlayerGrid";
import { StatRow } from "@/features/players/components/StatRow";
import { getPlayerStats, getPlayerCareer } from "@/features/players/api";
import { pairwiseMaxes } from "@/features/players/pairwise-maxes";
import type { ComparisonMetrics, Player } from "@/types/api";
import { bidiIsolate, isRtl, localizeDigits } from "@/utils/format";
import { revealProps } from "@/utils/reveal";
import { currentDataSeason, formatSeasonLabel, parseSeason } from "@/utils/season";
import { canonicalPath } from "@/utils/canonical";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    a?: string | string[];
    b?: string | string[];
    sa?: string | string[];
    sb?: string | string[];
    season?: string | string[];
  }>;
};

// Dynamic OG (versus poster of the two picked players, TASK-M53): season-pinned
// so each era link previews in its era's theme; carries the two slots so a
// shared link shows the actual matchup. Relative url resolves against the
// layout's metadataBase.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const season = parseSeason(sp.season, currentDataSeason());
  const a = parseId(sp.a);
  const b = parseId(sp.b);
  const url = compareOgImagePath({
    season,
    a,
    b,
    sa: parseSlotSeason(sp.sa, season),
    sb: parseSlotSeason(sp.sb, season),
  });
  const t = await getTranslations("compare");
  return {
    title: t("metaTitle"),
    alternates: { canonical: canonicalPath(locale, "/compare") },
    description: t("metaDescription"),
    openGraph: {
      images: [{ url, width: 1200, height: 630, alt: t("ogAlt") }],
    },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

// A slot resolved to its display name + metrics + a season label ("2024-25"
// for a single season, "Career 2003–2018" for the "All seasons" aggregate).
type Resolved = {
  player: Player;
  metrics: ComparisonMetrics;
  label: string;
  /**
   * TASK-M68: the slot's market value — that season's figure, or the career
   * PEAK for an `?sa=all` slot. Read from the clipped season map; `/compare`
   * is request-time, so the 5 MB history file is off limits here.
   */
  marketValueEur: number | null;
};

// Resolve one slot: a single season → `getPlayerStats`; "all" → the career
// aggregate. Returns null when the player has no data for the chosen season.
// `careerLabel` builds the localized "Career {from}–{to}" span label.
async function resolveSlot(
  id: number,
  slotSeason: SlotSeason,
  careerLabel: (from: number, to: number) => string,
  locale: string,
  marketValues: MarketValueFile | null,
): Promise<Resolved | null> {
  if (slotSeason === "all") {
    const career = await getPlayerCareer(id);
    if (!career) return null;
    return {
      player: career.player,
      metrics: career.metrics,
      label: careerLabel(career.span.from, career.span.to),
      // A career slot shows the PEAK. Summing valuations would be meaningless,
      // and null would waste the row on the page's most interesting comparison.
      marketValueEur: peakMarketValue(marketValues, id),
    };
  }
  const stats = await getPlayerStats(id, slotSeason);
  if (!stats) return null;
  return {
    player: stats.player,
    metrics: stats.metrics,
    label: formatSeasonLabel(slotSeason, locale),
    marketValueEur: marketValueForSeason(marketValues, slotSeason, id),
  };
}

// `/compare` (TASK-408, extended by TASK-M24): the head-to-head comparison page.
//
// **SSR-shareable:** reads `?a=`, `?b=`, `?sa=`, `?sb=`, `?season=` directly so
// a URL like `/compare?a=521&sa=2003&b=874` produces full server-side HTML with
// both player names. The slot pickers hydrate as client islands and write back
// into the URL via `useComparisonSelection()`.
//
// **Per-slot season (TASK-M24):** each slot resolves independently — a specific
// season via `getPlayerStats`, or "All seasons" (`?sa=all`) via the career
// aggregate. `?season=` is the global default each slot inherits when its own
// `sa`/`sb` is absent (and drives the suggested grid + in-slot search).
//
// **Three render branches:**
//   1. Both `a` and `b` resolve → the comparison view (names + per-slot season
//      labels, share button, the pairwise-normalized radar, 12 `<StatRow>`s).
//   2. One id present (or a resolve returned null for the chosen season) → a
//      "pick a second player" / "no comparison" hint.
//   3. Neither id present → no hint, just the two empty slot pickers.
export default async function ComparePage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  // Default to the latest committed data season so the page resolves
  // player stats when no ?season= is provided. See LATEST_DATA_SEASON.
  const season = parseSeason(sp.season, currentDataSeason());
  const aId = parseId(sp.a);
  const bId = parseId(sp.b);
  const saSeason = parseSlotSeason(sp.sa, season);
  const sbSeason = parseSlotSeason(sp.sb, season);
  const t = await getTranslations("compare");
  // Build the "2003–2018" span. On `/ar` it's Eastern-Arabic + flows RTL
  // naturally (year-first when read, NOT isolated — the season-label rule);
  // English keeps the bidi-isolated Western form.
  const careerLabel = (from: number, to: number) =>
    t("careerSpan", {
      span: isRtl(locale)
        ? localizeDigits(`${from}–${to}`, locale)
        : bidiIsolate(`${from}–${to}`, locale),
    });

  let aData: Resolved | null = null;
  let bData: Resolved | null = null;

  if (aId !== null && bId !== null) {
    // One read shared by both slots — the CLIPPED season map (624 KB), never
    // the history file: this page is request-time.
    const marketValues = await loadMarketValues();
    [aData, bData] = await Promise.all([
      resolveSlot(aId, saSeason, careerLabel, locale, marketValues),
      resolveSlot(bId, sbSeason, careerLabel, locale, marketValues),
    ]);
  }

  return (
    <main className="container-page space-y-8 py-6 lg:py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t("heading")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </header>

      {/* TASK-1513: the two slot cards with a "VS" between them. On mobile they
          stack full-width with VS centred between; from md they sit
          side-by-side. */}
      <section className="flex flex-col gap-3 md:flex-row md:items-center">
        <PlayerSlotPicker slot="A" season={season} className="flex-1" />
        <div className="flex shrink-0 items-center justify-center">
          <span
            aria-hidden
            className="bg-muted text-muted-foreground grid size-10 place-items-center rounded-full text-sm font-bold"
          >
            {t("vsDisc")}
          </span>
        </div>
        <PlayerSlotPicker slot="B" season={season} className="flex-1" />
      </section>

      {/* TS can't narrow `aData` / `bData` through an intermediate
          `bothLoaded` boolean, so the null checks live inline. */}
      {aData !== null && bData !== null ? (
        <ComparisonView a={aData} b={bData} />
      ) : (
        <>
          {/* TASK-605 quick-pick grid — shown below the pickers while a slot is
              empty (TASK-1513 moved it under the cards + hides it once both are
              picked). Client island; clicking a card writes the slot. */}
          {(aId === null || bId === null) && <SuggestedPlayerGrid season={season} />}
          <ComparisonEmpty aId={aId} bId={bId} />
        </>
      )}
    </main>
  );
}

function ComparisonView({ a, b }: { a: Resolved; b: Resolved }) {
  const t = useTranslations("compare");
  const tm = useTranslations("metrics");
  // TASK-M68 market-value keys live in the `players` namespace (shared with the
  // profile block), not `metrics`.
  const tp = useTranslations("players");
  // TASK-M24: pairwise radar baseline — each axis is normalized against the
  // larger of the two players' own values, so the chart is coherent for any
  // mix of seasons / careers. Always computable, so the radar always renders.
  const maxes = pairwiseMaxes(a.metrics, b.metrics);

  return (
    <section className="space-y-6">
      {/* TASK-409 / TASK-1513: the "this view is shareable" nudge sits right
          after the selected-players section. */}
      <ShareBanner />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight">
          {/* Both names + their per-slot season labels render server-side —
              this is what the AC's "view source contains both names" check
              looks for. */}
          <span>
            {a.player.name}
            <span className="text-muted-foreground ml-2 text-sm font-normal">· {a.label}</span>
          </span>
          <span className="text-muted-foreground mx-2 text-base font-normal">{t("vs")}</span>
          <span>
            {b.player.name}
            <span className="text-muted-foreground ml-2 text-sm font-normal">· {b.label}</span>
          </span>
        </h2>
        <CopyCompareLink />
      </div>

      {/* TASK-1513: the radar is centred (not stretched full-width). Its legend
          names carry the per-slot season (TASK-M11) so the two colored polygons
          are distinguishable — e.g. the same player across two seasons
          ("Mohamed Salah (2024-25)" vs "(2025-26)"). */}
      <div className="mx-auto w-full max-w-xl" {...revealProps()}>
        <ComparisonRadarLazy
          aMetrics={a.metrics}
          bMetrics={b.metrics}
          aName={`${a.player.name} (${a.label})`}
          bName={`${b.player.name} (${b.label})`}
          maxes={maxes}
        />
      </div>

      {/* Head-to-head bars — centred + width-capped so the split bars stay
          short rather than spanning the whole page (TASK-1513). */}
      {/* Wrapper-level reveal (TASK-1704) — the compare slot cards themselves are
          deliberately NOT revealed: they carry the TASK-910 view-transition-name
          morph, and a reveal animation on the same box would fight it. */}
      <ul className="mx-auto flex w-full max-w-2xl flex-col gap-3" {...revealProps()}>
        {COMPARISON_METRICS.map(({ key, labelKey, format }) => (
          <StatRow
            key={key}
            label={tm(labelKey)}
            a={a.metrics[key]}
            b={b.metrics[key]}
            format={format}
          />
        ))}
        {/* TASK-M20: xG / xA rows, shown only when at least one slot's season
            carries them (FBref 2017-24, FPL 2025-26). */}
        {(a.metrics.xg != null || b.metrics.xg != null) && (
          <StatRow
            label={tm("xg")}
            a={a.metrics.xg ?? null}
            b={b.metrics.xg ?? null}
            format={(n) => n.toFixed(1)}
          />
        )}
        {(a.metrics.xa != null || b.metrics.xa != null) && (
          <StatRow
            label={tm("xa")}
            a={a.metrics.xa ?? null}
            b={b.metrics.xa ?? null}
            format={(n) => n.toFixed(1)}
          />
        )}
        {/* TASK-M68: market value — era-sparse in the same way (Transfermarkt's
            history starts ~2004) and absent for unmatched players, so it renders
            only when at least one slot carries a value. */}
        {(a.marketValueEur != null || b.marketValueEur != null) && (
          <StatRow
            label={tp("marketValue")}
            a={a.marketValueEur}
            b={b.marketValueEur}
            format={(n) => formatMarketValue(n, { k: tp("mvUnitK"), m: tp("mvUnitM") })}
          />
        )}
        {/* TASK-M18: clean sheets (~2000-01+) + GK saves (~2006-07+), shown only
            when at least one slot's season carries them. */}
        {(a.metrics.cleanSheets != null || b.metrics.cleanSheets != null) && (
          <StatRow
            label={tm("cleanSheets")}
            a={a.metrics.cleanSheets ?? null}
            b={b.metrics.cleanSheets ?? null}
            format={(n) => String(n)}
          />
        )}
        {(a.metrics.saves != null || b.metrics.saves != null) && (
          <StatRow
            label={tm("saves")}
            a={a.metrics.saves ?? null}
            b={b.metrics.saves ?? null}
            format={(n) => String(n)}
          />
        )}
      </ul>

      {/*
        TASK-M93 — career honours, in their OWN list below the season bars.
        Deliberately not folded into COMPARISON_METRICS: those are per-season
        stats for the two picked seasons, while these are whole-career totals
        that do not change with the slot's season. Mixing them would invite
        reading "3 trophies" as "3 trophies in 2024-25".

        Rendered only when at least one side is enriched. `caps` null means
        UNKNOWN, not zero, and StatRow already renders null as "—" with a
        neutral 50/50 bar rather than implying a real ratio.
      */}
      {(a.player.enrichment || b.player.enrichment) && (
        <ul className="mx-auto flex w-full max-w-2xl flex-col gap-3" {...revealProps()}>
          <StatRow
            label={tp("statTrophies")}
            a={a.player.enrichment?.trophies ?? null}
            b={b.player.enrichment?.trophies ?? null}
            format={(n) => String(n)}
          />
          <StatRow
            label={tp("statCaps")}
            a={a.player.enrichment?.caps ?? null}
            b={b.player.enrichment?.caps ?? null}
            format={(n) => String(n)}
          />
        </ul>
      )}
    </section>
  );
}

function ComparisonEmpty({ aId, bId }: { aId: number | null; bId: number | null }) {
  const t = useTranslations("compare");
  const filled = (aId !== null ? 1 : 0) + (bId !== null ? 1 : 0);
  if (filled === 0) {
    // Two pickers above already make the call to action obvious; an
    // additional "pick two players above" line would be redundant.
    return null;
  }
  if (filled === 2) {
    // Both ids are in the URL but at least one slot resolved to null — i.e. a
    // picked player has no stats for the season chosen for that slot. Explain
    // it rather than showing the misleading "pick a second player" hint
    // (TASK-703, now per-slot-season aware via TASK-M24).
    return <DataUnavailable title={t("noComparisonTitle")} message={t("noComparisonMsg")} />;
  }
  return (
    <p
      role="status"
      className="text-muted-foreground bg-card rounded-md border px-4 py-6 text-center text-sm"
    >
      {t("pickSecond")}
    </p>
  );
}
