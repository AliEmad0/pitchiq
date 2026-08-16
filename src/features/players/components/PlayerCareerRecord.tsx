import { useLocale, useTranslations } from "next-intl";
import { Award, Globe, Trophy } from "lucide-react";

import type {
  CareerHonourGroup,
  CareerMove,
  PlayerCareerRecord as Record_,
} from "@/features/players/career-record.api";
import { localizeDigits } from "@/utils/format";
import { revealProps } from "@/utils/reveal";

/**
 * TASK-M92 — honours, transfers and the international career on `/players/[id]`.
 *
 * Owner-picked layout (concept 14, "Headline + fold"): each section shows its five
 * strongest rows and folds the remainder into a native `<details>`. Ronaldo has 42 honour
 * groups and Michael Hector 34 moves — unfolded, either buries the rest of the page.
 * `<details>` keeps the full record in the DOM, so it stays crawlable and Ctrl-F-able,
 * which a tabbed or lazily-fetched variant would not.
 *
 * Section order is honours → transfers → international (owner's call).
 *
 * ⚠️ Three data rules this component exists to respect:
 *
 *  1. **Silverware is not the honour count.** 25,886 of 29,761 groups are
 *     `participation` and 1,597 are `runner-up`. The headline counts only
 *     `kind: "trophy"`; the rest are shown, labelled, and never added in.
 *  2. **Fees are display strings, never numbers.** 1,321 distinct values, of which the
 *     five commonest are `-`, `free transfer`, `End of loan`, `loan transfer` and `?`
 *     (54,325 moves). They are printed verbatim and only *styled* by kind — coercing
 *     them would invent a free transfer for every loan.
 *  3. **Absence means "not enriched", never "has none."** The whole block is omitted for
 *     a player with no record rather than rendering zeros.
 */

const FOLD_AT = 5;

/** Presentation only — the fee string itself is always printed unchanged. */
function feeTone(fee: string | null): string {
  const f = (fee ?? "").toLowerCase();
  if (f.includes("loan")) return "text-teal-700 dark:text-teal-300";
  if (f.includes("free")) return "text-muted-foreground";
  if (f === "" || f === "-" || f === "?") return "text-muted-foreground";
  return "";
}

function HonourRow({ group }: { group: CareerHonourGroup }) {
  const t = useTranslations("players");
  const locale = useLocale();
  const clubs = [...new Set(group.entries.map((e) => e.club))].filter(
    (c): c is string => typeof c === "string" && c.length > 0,
  );
  const tone =
    group.kind === "trophy"
      ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
      : group.kind === "award"
        ? "bg-primary/10 text-primary"
        : "bg-muted text-muted-foreground";
  return (
    <li className="flex items-baseline justify-between gap-4 border-b py-1.5 last:border-b-0">
      <span className="min-w-0">
        <span className="font-medium">{group.title}</span>
        {clubs.length > 0 && (
          <span className="text-muted-foreground ms-2 text-xs">
            {clubs.slice(0, 2).join(" · ")}
          </span>
        )}
        <span className="sr-only"> — {t(`honourKind.${group.kind}`)}</span>
      </span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`}
      >
        {localizeDigits(group.count, locale)}×
      </span>
    </li>
  );
}

function MoveRow({ move }: { move: CareerMove }) {
  const locale = useLocale();
  return (
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-baseline gap-3 border-b py-1.5 text-sm last:border-b-0">
      <span className="text-muted-foreground text-xs tabular-nums">
        {move.season ? localizeDigits(move.season, locale) : "—"}
      </span>
      <span className="min-w-0 truncate">
        {move.from ?? "—"} <span className="text-muted-foreground">→</span>{" "}
        <span className="font-medium">{move.to ?? "—"}</span>
      </span>
      {/* Printed verbatim — see rule 2 in the header. */}
      <span className={`text-xs tabular-nums ${feeTone(move.fee)}`}>{move.fee ?? "—"}</span>
    </li>
  );
}

/** Five rows, then the remainder behind a disclosure that says how many it holds. */
function Folded<T>({
  items,
  render,
  moreLabel,
}: {
  items: T[];
  render: (item: T, i: number) => React.ReactNode;
  moreLabel: string;
}) {
  const head = items.slice(0, FOLD_AT);
  const rest = items.slice(FOLD_AT);
  return (
    <>
      <ul className="m-0 list-none p-0">{head.map(render)}</ul>
      {rest.length > 0 && (
        <details className="group mt-1">
          <summary className="text-primary hover:text-primary/80 cursor-pointer text-sm font-medium">
            {moreLabel}
          </summary>
          <ul className="m-0 mt-1 list-none p-0">{rest.map(render)}</ul>
        </details>
      )}
    </>
  );
}

function SectionHead({
  icon: Icon,
  title,
  note,
}: {
  icon: typeof Trophy;
  title: string;
  note?: string;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase">
        <Icon className="size-3.5" aria-hidden />
        {title}
      </h2>
      {note && <span className="text-muted-foreground text-xs tabular-nums">{note}</span>}
    </div>
  );
}

export function PlayerCareerRecord({ record }: { record: Record_ | null }) {
  const t = useTranslations("players");
  const locale = useLocale();
  // Rule 3: no record → nothing at all, not a heading over an empty list.
  if (!record) return null;

  const num = (n: number | null) => (n === null ? "—" : localizeDigits(n, locale));

  return (
    <section className="space-y-6" aria-label={t("careerRecord")} {...revealProps()}>
      {record.honourGroups.length > 0 && (
        <div>
          <SectionHead
            icon={Trophy}
            title={t("honoursTitle")}
            note={t("trophyCount", { count: num(record.trophies) })}
          />
          <Folded
            items={record.honourGroups}
            render={(g, i) => <HonourRow key={`${g.title}-${i}`} group={g} />}
            moreLabel={t("showAllHonours", { count: num(record.honourGroups.length) })}
          />
        </div>
      )}

      {record.moves.length > 0 && (
        <div>
          <SectionHead
            icon={Award}
            title={t("transfersTitle")}
            note={record.feeSum ? t("feeSum", { total: record.feeSum }) : undefined}
          />
          <Folded
            items={record.moves}
            render={(m, i) => <MoveRow key={`${m.season}-${m.to}-${i}`} move={m} />}
            moreLabel={t("showAllMoves", { count: num(record.moves.length) })}
          />
        </div>
      )}

      {/* International sits AFTER transfers (owner's call). */}
      {record.caps !== null && (
        <div>
          <SectionHead icon={Globe} title={t("internationalTitle")} />
          <div className="flex flex-wrap items-baseline gap-6">
            <p>
              <span className="text-2xl font-bold tabular-nums">{num(record.caps)}</span>{" "}
              <span className="text-muted-foreground text-xs">{t("statCaps")}</span>
            </p>
            <p>
              <span className="text-2xl font-bold tabular-nums">
                {num(record.internationalGoals)}
              </span>{" "}
              <span className="text-muted-foreground text-xs">{t("intlGoals")}</span>
            </p>
            {record.nationalSpells.some((s) => s.debutDate) && (
              <p className="text-muted-foreground text-xs">
                {t("debut", {
                  year: localizeDigits(
                    record.nationalSpells.find((s) => s.debutDate)!.debutDate!.slice(0, 4),
                    locale,
                  ),
                })}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
