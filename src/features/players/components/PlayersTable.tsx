"use client";

import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { parseAsInteger, parseAsString, parseAsStringEnum, useQueryState } from "nuqs";
import { useEffect, useRef } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Flag } from "@/features/players/components/Flag";
import { PlayerImage } from "@/features/players/components/PlayerImage";
import { formatMarketValue } from "@/features/players/market-value";
import type { PlayerIndexRow, PlayerPosition } from "@/features/players/players-index.api";
import { cn } from "@/utils/cn";
import { localizeDigits } from "@/utils/format";
import { revealProps } from "@/utils/reveal";
import { formatSeasonLabel, withSeason } from "@/utils/season";

// TASK-M68 added `marketValue`. `contributions` stays the DEFAULT: market value
// is the truer "most valuable" measure, but no player has one before ~2004, so
// defaulting to it would leave a dozen seasons sorted arbitrarily.
const SORT_KEYS = [
  "contributions",
  "marketValue",
  "goals",
  "assists",
  "appearances",
  "name",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];
/** The numeric row fields that sort with a plain descending compare. */
type NumericSortKey = Exclude<SortKey, "name" | "marketValue">;
// Translation-key maps (labels localized via the `players` catalog, TASK-1603).
const SORT_LABEL_KEY: Record<SortKey, string> = {
  contributions: "gaAbbr",
  marketValue: "sortMarketValue",
  goals: "sortGoals",
  assists: "sortAssists",
  appearances: "apps",
  name: "sortName",
};
const POSITIONS: PlayerPosition[] = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
// M21 — short Pos-column codes (was a 3-char slice → "Goa"/"For").
const POS_ABBR_KEY: Record<PlayerPosition, string> = {
  Goalkeeper: "posGk",
  Defender: "posDef",
  Midfielder: "posMid",
  Forward: "posFw",
};
// Full position names for the filter dropdown (the `value` stays the English
// enum since it's the data key `filterPlayerRows` matches on).
const POS_FULL_KEY: Record<PlayerPosition, string> = {
  Goalkeeper: "posGoalkeeper",
  Defender: "posDefender",
  Midfielder: "posMidfielder",
  Forward: "posForward",
};

export type PlayerFilters = { q?: string; pos?: string; club?: string; nat?: string };

export function filterPlayerRows(rows: PlayerIndexRow[], f: PlayerFilters): PlayerIndexRow[] {
  const needle = (f.q ?? "").trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!needle || r.name.toLowerCase().includes(needle)) &&
      (!f.pos || r.position === f.pos) &&
      (!f.club || String(r.teamId) === f.club) &&
      (!f.nat || r.nationalityCode === f.nat),
  );
}

export function sortPlayerRows(rows: PlayerIndexRow[], key: SortKey): PlayerIndexRow[] {
  const out = [...rows];
  const byName = (a: PlayerIndexRow, b: PlayerIndexRow) => a.name.localeCompare(b.name);
  if (key === "name") out.sort(byName);
  else if (key === "marketValue")
    // Unvalued players sink, always. No Transfermarkt match means UNKNOWN, not
    // worthless, so a null must never outrank a real valuation — and treating
    // it as 0 would also put it above nothing meaningful anyway.
    out.sort((a, b) => {
      const av = a.marketValueEur;
      const bv = b.marketValueEur;
      if (av === null || bv === null) {
        if (av === bv) return byName(a, b);
        return av === null ? 1 : -1;
      }
      return bv - av || byName(a, b);
    });
  else {
    const numeric = key as NumericSortKey;
    out.sort((a, b) => b[numeric] - a[numeric] || b.goals - a.goals || byName(a, b));
  }
  return out;
}

const PAGE_SIZE = 50;

/** Slice `rows` to one page, clamping `page` into the valid 1..totalPages window. */
export function paginate<T>(
  rows: T[],
  page: number,
  size: number = PAGE_SIZE,
): { rows: T[]; current: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), totalPages);
  return { rows: rows.slice((current - 1) * size, current * size), current, totalPages };
}

// Distinct {value,label} options from the rows, sorted by label.
function clubOptions(rows: PlayerIndexRow[]) {
  const m = new Map<string, string>();
  for (const r of rows) m.set(String(r.teamId), r.teamName);
  return [...m.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
function nationalityOptions(rows: PlayerIndexRow[]) {
  const m = new Map<string, string>();
  for (const r of rows)
    if (r.nationalityCode) m.set(r.nationalityCode, r.nationality ?? r.nationalityCode);
  return [...m.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const ALL = "__all__";

export function PlayersTable({ rows, season }: { rows: PlayerIndexRow[]; season: number }) {
  const t = useTranslations("players");
  const locale = useLocale();
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
  const [pos, setPos] = useQueryState("pos", parseAsString.withDefault(""));
  const [club, setClub] = useQueryState("club", parseAsString.withDefault(""));
  const [nat, setNat] = useQueryState("nat", parseAsString.withDefault(""));
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsStringEnum([...SORT_KEYS]).withDefault("contributions"),
  );
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  // Any filter/sort change returns to page 1 (null clears it from the URL).
  const resetPage = () => setPage(null);
  const goTo = (n: number) => setPage(n <= 1 ? null : n);

  // Reset pagination when the season changes (the header switcher writes
  // ?season= but preserves ?page=). Ref-guarded so an initial deep link
  // (?season=2020&page=3) is honored on mount; only a post-mount change resets.
  const prevSeason = useRef(season);
  useEffect(() => {
    if (prevSeason.current !== season) {
      prevSeason.current = season;
      void setPage(null);
    }
  }, [season, setPage]);

  const visible = sortPlayerRows(filterPlayerRows(rows, { q, pos, club, nat }), sort);
  const { rows: pageRows, current, totalPages } = paginate(visible, page);
  const clubs = clubOptions(rows);
  const nats = nationalityOptions(rows);

  const sel = (
    value: string,
    onChange: (v: string) => void,
    label: string,
    opts: { value: string; label: string }[],
  ) => (
    <Select
      value={value || ALL}
      onValueChange={(v) => {
        onChange(v === ALL ? "" : v);
        resetPage();
      }}
    >
      <SelectTrigger className="w-[160px]" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t("filterAll", { label })}</SelectItem>
        {opts.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    // Wrapper-level reveal only (TASK-1704): individual <tr>s never reveal —
    // filter/sort/pagination churn would replay them, and transforms on table
    // rows are risky. The whole table block rises once.
    <div className="space-y-4" {...revealProps()}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value || null);
            resetPage();
          }}
          placeholder={t("searchPlaceholder", { season: formatSeasonLabel(season, locale) })}
          aria-label={t("searchPlayers")}
          className="max-w-xs"
        />
        {sel(
          pos,
          (v) => setPos(v || null),
          t("position"),
          POSITIONS.map((p) => ({ value: p, label: t(POS_FULL_KEY[p]) })),
        )}
        {sel(club, (v) => setClub(v || null), t("club"), clubs)}
        {sel(nat, (v) => setNat(v || null), t("nationality"), nats)}
        <div
          className="flex flex-wrap items-center gap-1"
          role="group"
          aria-label={t("sortPlayers")}
        >
          {SORT_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setSort(k === "contributions" ? null : k);
                resetPage();
              }}
              aria-pressed={sort === k}
              className={cn(
                "rounded-md border px-2 py-1 text-xs",
                sort === k
                  ? "bg-primary text-primary-foreground"
                  : "ix-glow ix-press hover:bg-accent",
              )}
            >
              {t(SORT_LABEL_KEY[k])}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          {t("noMatch")}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr>
                  <th className="px-3 py-2 text-start">{t("colRank")}</th>
                  <th className="px-3 py-2 text-start">{t("colPlayer")}</th>
                  <th className="px-3 py-2 text-start">{t("club")}</th>
                  <th className="px-2 py-2 text-start">{t("colPos")}</th>
                  <th className="px-2 py-2 text-end">{t("apps")}</th>
                  <th className="px-2 py-2 text-end">{t("colGoals")}</th>
                  <th className="px-2 py-2 text-end">{t("colAssists")}</th>
                  <th className="px-2 py-2 text-end font-semibold">{t("gaAbbr")}</th>
                  <th className="px-2 py-2 text-end">{t("colMarketValue")}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => (
                  <tr key={r.id} className="border-t even:bg-muted/30 hover:bg-muted/50">
                    <td className="text-muted-foreground px-3 py-2 tabular-nums">
                      {(current - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <PlayerImage
                          player={{ name: r.name, photo: r.photo }}
                          size="sm"
                          className="rounded-full"
                        />
                        <Link
                          href={withSeason(`/players/${r.id}`, season)}
                          className="font-medium hover:underline"
                        >
                          {r.name}
                        </Link>
                        <Flag code={r.nationalityCode} name={r.nationality} />
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={withSeason(`/teams/${r.teamId}`, season)}
                        className="flex items-center gap-2 hover:underline"
                      >
                        {r.teamLogo && (
                          <Image
                            src={r.teamLogo}
                            alt=""
                            width={20}
                            height={20}
                            className="size-5 object-contain"
                            unoptimized
                          />
                        )}
                        <span className="truncate">{r.teamName}</span>
                      </Link>
                    </td>
                    <td className="text-muted-foreground px-2 py-2">
                      {t(POS_ABBR_KEY[r.position])}
                    </td>
                    <td className="px-2 py-2 text-end tabular-nums">
                      {localizeDigits(r.appearances, locale)}
                    </td>
                    <td className="px-2 py-2 text-end tabular-nums">
                      {localizeDigits(r.goals, locale)}
                    </td>
                    <td className="px-2 py-2 text-end tabular-nums">
                      {localizeDigits(r.assists, locale)}
                    </td>
                    <td className="text-primary px-2 py-2 text-end font-bold tabular-nums">
                      {localizeDigits(r.contributions, locale)}
                    </td>
                    <td className="text-muted-foreground px-2 py-2 text-end tabular-nums">
                      {r.marketValueEur === null
                        ? "—"
                        : localizeDigits(
                            formatMarketValue(r.marketValueEur, {
                              k: t("mvUnitK"),
                              m: t("mvUnitM"),
                            }),
                            locale,
                          )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <nav
              className="flex items-center justify-between gap-2 text-sm"
              aria-label={t("pagination")}
            >
              <span className="text-muted-foreground tabular-nums">
                {t("showing", {
                  from: localizeDigits((current - 1) * PAGE_SIZE + 1, locale),
                  to: localizeDigits(Math.min(current * PAGE_SIZE, visible.length), locale),
                  total: localizeDigits(visible.length, locale),
                })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goTo(current - 1)}
                  disabled={current <= 1}
                  className="ix-glow ix-press rounded-md border px-3 py-1 text-xs hover:bg-accent disabled:opacity-40"
                >
                  {t("prev")}
                </button>
                <span className="tabular-nums">
                  {t("pageOf", {
                    current: localizeDigits(current, locale),
                    total: localizeDigits(totalPages, locale),
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => goTo(current + 1)}
                  disabled={current >= totalPages}
                  className="ix-glow ix-press rounded-md border px-3 py-1 text-xs hover:bg-accent disabled:opacity-40"
                >
                  {t("next")}
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
