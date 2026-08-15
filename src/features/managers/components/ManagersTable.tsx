"use client";

import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { parseAsString, parseAsStringEnum, useQueryState } from "nuqs";

import { Input } from "@/components/ui/input";
import { Flag } from "@/features/players/components/Flag";
import { PlayerImage } from "@/features/players/components/PlayerImage";
import type { ManagerIndexRow } from "@/features/managers/managers-index.api";
import { cn } from "@/utils/cn";
import { localizeDigits } from "@/utils/format";
import { revealProps } from "@/utils/reveal";
import { formatSeasonLabel, withSeason } from "@/utils/season";

const SORT_KEYS = ["points", "ppg", "win", "winPct", "name"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

// Translation-key per sort (localized via the `managers` catalog, TASK-1603).
const SORT_LABEL_KEY: Record<SortKey, string> = {
  points: "sortPoints",
  ppg: "ppg",
  win: "sortWins",
  winPct: "winPct",
  name: "sortName",
};

export function filterManagerRows(rows: ManagerIndexRow[], q: string): ManagerIndexRow[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (r) => r.name.toLowerCase().includes(needle) || r.teamName.toLowerCase().includes(needle),
  );
}

export function sortManagerRows(rows: ManagerIndexRow[], key: SortKey): ManagerIndexRow[] {
  const out = [...rows];
  const byId = (a: ManagerIndexRow, b: ManagerIndexRow) => a.managerId.localeCompare(b.managerId);
  if (key === "name") out.sort((a, b) => a.name.localeCompare(b.name));
  else if (key === "win") out.sort((a, b) => b.record.win - a.record.win || byId(a, b));
  else if (key === "ppg") out.sort((a, b) => b.record.ppg - a.record.ppg || byId(a, b));
  else if (key === "winPct") out.sort((a, b) => b.record.winPct - a.record.winPct || byId(a, b));
  else
    out.sort(
      (a, b) => b.record.points - a.record.points || b.record.ppg - a.record.ppg || byId(a, b),
    );
  return out;
}

export function ManagersTable({ rows, season }: { rows: ManagerIndexRow[]; season: number }) {
  const t = useTranslations("managers");
  const locale = useLocale();
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsStringEnum([...SORT_KEYS]).withDefault("points"),
  );
  const visible = sortManagerRows(filterManagerRows(rows, q), sort);

  return (
    // Wrapper-level reveal only (TASK-1704) — see <PlayersTable>.
    <div className="space-y-4" {...revealProps()}>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value || null)}
          placeholder={t("filterPlaceholder", { season: formatSeasonLabel(season, locale) })}
          aria-label={t("filterManagers")}
          className="max-w-sm"
        />
        <div
          className="flex flex-wrap items-center gap-1"
          role="group"
          aria-label={t("sortManagers")}
        >
          {SORT_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k === "points" ? null : k)}
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
          {t("noMatch", { q: q.trim() })}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs">
              <tr>
                <th className="px-3 py-2 text-start">{t("colRank")}</th>
                <th className="px-3 py-2 text-start">{t("colManager")}</th>
                <th className="px-3 py-2 text-start">{t("colClub")}</th>
                <th className="px-2 py-2 text-end">{t("colP")}</th>
                <th className="px-2 py-2 text-end">{t("colW")}</th>
                <th className="px-2 py-2 text-end">{t("colD")}</th>
                <th className="px-2 py-2 text-end">{t("colL")}</th>
                <th className="px-2 py-2 text-end">{t("colGd")}</th>
                <th className="px-2 py-2 text-end font-semibold">{t("colPts")}</th>
                <th className="px-2 py-2 text-end">{t("ppg")}</th>
                <th className="px-2 py-2 text-end">{t("winPct")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={`${r.managerId}-${r.teamId}`} className="border-t">
                  <td className="text-muted-foreground px-3 py-2 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <PlayerImage
                        player={{ name: r.name, photo: r.photo, photoFallback: r.photoFallback }}
                        size="sm"
                        className="rounded-full"
                      />
                      <Link
                        href={withSeason(`/managers/${r.managerId}`, season)}
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
                  <td className="px-2 py-2 text-end tabular-nums">
                    {localizeDigits(r.record.played, locale)}
                  </td>
                  <td className="px-2 py-2 text-end tabular-nums">
                    {localizeDigits(r.record.win, locale)}
                  </td>
                  <td className="px-2 py-2 text-end tabular-nums">
                    {localizeDigits(r.record.draw, locale)}
                  </td>
                  <td className="px-2 py-2 text-end tabular-nums">
                    {localizeDigits(r.record.loss, locale)}
                  </td>
                  <td className="px-2 py-2 text-end tabular-nums">
                    {localizeDigits(r.record.gd > 0 ? `+${r.record.gd}` : r.record.gd, locale)}
                  </td>
                  <td className="px-2 py-2 text-end font-semibold tabular-nums">
                    {localizeDigits(r.record.points, locale)}
                  </td>
                  <td className="px-2 py-2 text-end tabular-nums">
                    {localizeDigits(r.record.ppg.toFixed(2), locale)}
                  </td>
                  <td className="px-2 py-2 text-end tabular-nums">
                    {localizeDigits(`${r.record.winPct.toFixed(0)}%`, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
