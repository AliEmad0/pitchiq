import { useLocale, useTranslations } from "next-intl";

import type { ManagerCareerSpell } from "@/data/schemas";
import { spellPpm, spellSpan } from "@/features/managers/career-enrichment";
import { cn } from "@/utils/cn";
import { bidiIsolate, isRtl, localizeDigits } from "@/utils/format";
import { revealProps } from "@/utils/reveal";

/**
 * TASK-M81 — every job of a manager's career, including clubs that never played
 * in this league.
 *
 * Complements the by-club table above rather than replacing it: that one is our
 * own league data (points, goal difference, per-season detail), this one is the
 * shape of the whole career — Porto, Inter, Real Madrid.
 *
 * Same responsive split as `<ManagerCareerTable>`: a table from `md:`, a card per
 * spell below it, because a 7-column table is unreadable at 375px.
 */
export function ManagerFullCareer({ spells }: { spells: ManagerCareerSpell[] }) {
  const t = useTranslations("managers");
  const locale = useLocale();
  if (spells.length === 0) return null;

  // Years only — TM's end cell is free text and can read "expected 30/06/2027".
  // A range flows RTL naturally, so it is isolated in LTR only (the season-label rule).
  const span = (s: ManagerCareerSpell) => {
    const sp = spellSpan(s);
    if (!sp) return "—";
    const range = sp.to ? `${sp.from}–${sp.to}` : `${sp.from}–`;
    return isRtl(locale) ? localizeDigits(range, locale) : bidiIsolate(range, locale);
  };
  const ppm = (s: ManagerCareerSpell) => {
    const v = spellPpm(s);
    return v === null ? "—" : localizeDigits(v.toFixed(2), locale);
  };
  const num = (v: number | null) => (v === null ? "—" : localizeDigits(v, locale));

  // The role is shown only when it is NOT a plain managerial post — a "Caretaker
  // Manager" or "Player-Coach" spell is worth flagging, "Manager" on every row is
  // noise. Source-form, like every other data value.
  const roleBadge = (s: ManagerCareerSpell) =>
    s.role && s.role.toLowerCase() !== "manager" ? (
      <span className="bg-muted text-muted-foreground ms-2 rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap">
        {s.role}
      </span>
    ) : null;

  return (
    <section
      aria-label={t("fullCareer")}
      className="bg-card rounded-lg border p-4 lg:p-6"
      {...revealProps()}
    >
      <h2 className="mb-1 text-sm font-semibold tracking-tight">{t("fullCareer")}</h2>
      <p className="text-muted-foreground mb-3 text-xs">{t("fullCareerNote")}</p>

      {/* Desktop */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr>
              <th className="px-2 py-2 text-start">{t("colClub")}</th>
              <th className="px-2 py-2 text-start">{t("colSpan")}</th>
              <th className="px-2 py-2 text-end">{t("colP")}</th>
              <th className="px-2 py-2 text-end">{t("colW")}</th>
              <th className="px-2 py-2 text-end">{t("colD")}</th>
              <th className="px-2 py-2 text-end">{t("colL")}</th>
              <th className="px-2 py-2 text-end font-semibold">{t("ppm")}</th>
            </tr>
          </thead>
          <tbody>
            {spells.map((s, i) => (
              <tr key={`${s.clubId ?? s.club}-${s.appointedDate ?? i}`} className="border-t">
                <td className="px-2 py-2">
                  <span className="font-medium">{s.club ?? "—"}</span>
                  {roleBadge(s)}
                </td>
                <td className="text-muted-foreground px-2 py-2 tabular-nums">{span(s)}</td>
                <td className="px-2 py-2 text-end tabular-nums">{num(s.matches)}</td>
                <td className="px-2 py-2 text-end tabular-nums">{num(s.wins)}</td>
                <td className="px-2 py-2 text-end tabular-nums">{num(s.draws)}</td>
                <td className="px-2 py-2 text-end tabular-nums">{num(s.losses)}</td>
                <td className="px-2 py-2 text-end font-semibold tabular-nums">{ppm(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="space-y-2.5 md:hidden">
        {spells.map((s, i) => (
          <li key={`${s.clubId ?? s.club}-${s.appointedDate ?? i}`}>
            <div className={cn("bg-background rounded-lg border p-3")}>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-semibold">
                  {s.club ?? "—"}
                  {roleBadge(s)}
                </span>
                <span className="text-primary shrink-0 text-base font-bold tabular-nums">
                  {ppm(s)}
                  <span className="text-muted-foreground ms-1 text-xs font-normal">
                    {t("ppm")}
                  </span>
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">{span(s)}</p>
              <dl className="mt-2.5 grid grid-cols-4 gap-1 text-center">
                {(
                  [
                    ["P", s.matches],
                    ["W", s.wins],
                    ["D", s.draws],
                    ["L", s.losses],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground text-[10px] tracking-wide uppercase">
                      {label}
                    </dt>
                    <dd className="text-sm font-semibold tabular-nums">{num(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
