import type { StatLeaderboardEntry } from "@/features/players/components/StatLeaderboard";
import type { ComparisonMetrics, ExtendedMetrics, Player } from "@/data/schemas";

type Accent = "amber" | "blue" | "yellow" | "red";

/**
 * What a board can rank by: a top-level metric, or one of the 54 extended fields
 * addressed as `extended.<field>` (TASK-M83).
 *
 * ⛔ The `Exclude` is load-bearing. `"extended"` is itself a key of `ComparisonMetrics`,
 * so without it `key: "extended"` type-checks and `rankBy` sorts OBJECTS with `>` — which
 * does not throw, it just produces a meaningless order. The type is the only thing between
 * that and a shipped board.
 */
export type BaseMetricKey = Exclude<keyof ComparisonMetrics, "extended">;
export type MetricKey = BaseMetricKey | `extended.${Extract<keyof ExtendedMetrics, string>}`;

const EXTENDED_PREFIX = "extended.";

/**
 * The number a board ranks on, or null when this player has none.
 *
 * ⚠️ Rows before 2008 carry no `metrics.extended` at all, so the optional chain is the
 * normal path rather than defensive padding.
 */
function metricValue(p: Player, key: MetricKey): number | null {
  if (key.startsWith(EXTENDED_PREFIX)) {
    const field = key.slice(EXTENDED_PREFIX.length) as keyof ExtendedMetrics;
    const v = p.metrics.extended?.[field];
    return typeof v === "number" ? v : null;
  }
  const v = p.metrics[key as BaseMetricKey];
  return typeof v === "number" ? v : null;
}

/**
 * Section headings on `/leaderboards`, in display order (TASK-M83).
 *
 * ⚠️ FIVE groups, not four. `appearances` belongs to none of attacking/passing/defending/
 * discipline, and forcing it into one would be a worse lie than giving it its own heading.
 */
export const LEADERBOARD_GROUPS = [
  "overall",
  "attacking",
  "passing",
  "defending",
  "discipline",
] as const;

export type LeaderboardGroup = (typeof LEADERBOARD_GROUPS)[number];

// `title`/`valueLabel` are the English fallback (used by the OG-card route,
// which stays English/brand). `titleKey`/`valueLabelKey` are message keys in the
// `leaderboard` namespace — the `/leaderboards` page resolves them via `t(...)`
// so the boards are localized (TASK-1603).
export type LeaderboardCategory = {
  key: MetricKey;
  /** Required — a category with no section must not compile. */
  group: LeaderboardGroup;
  title: string;
  valueLabel: string;
  titleKey: string;
  valueLabelKey: string;
  accent?: Accent;
  decimals?: number;
  // Restrict the ranked pool to these positions (M21 — Clean Sheets = GK/DEF,
  // since the PL `clean_sheet` metric is credited per-player to every position).
  positions?: Player["position"][];
};

// Display order: attacking → keeping/defending → advanced → discipline.
export const LEADERBOARD_CATEGORIES: readonly LeaderboardCategory[] = [
  { key: "goals", group: "attacking", title: "Goals", valueLabel: "Goals", titleKey: "catGoalsTitle", valueLabelKey: "catGoalsValue", accent: "amber" }, // prettier-ignore
  { key: "assists", group: "attacking", title: "Assists", valueLabel: "Assists", titleKey: "catAssistsTitle", valueLabelKey: "catAssistsValue", accent: "blue" }, // prettier-ignore
  { key: "appearances", group: "overall", title: "Appearances", valueLabel: "Apps", titleKey: "catAppearancesTitle", valueLabelKey: "catAppearancesValue" }, // prettier-ignore
  {
    key: "cleanSheets",
    group: "defending",
    title: "Clean Sheets",
    valueLabel: "CS",
    titleKey: "catCleanSheetsTitle",
    valueLabelKey: "catCleanSheetsValue",
    positions: ["Goalkeeper", "Defender"],
  },
  { key: "saves", group: "defending", title: "Saves", valueLabel: "Saves", titleKey: "catSavesTitle", valueLabelKey: "catSavesValue" }, // prettier-ignore
  { key: "keyPasses", group: "passing", title: "Key Passes", valueLabel: "Key passes", titleKey: "catKeyPassesTitle", valueLabelKey: "catKeyPassesValue" }, // prettier-ignore
  { key: "tackles", group: "defending", title: "Tackles", valueLabel: "Tackles", titleKey: "catTacklesTitle", valueLabelKey: "catTacklesValue" }, // prettier-ignore
  { key: "interceptions", group: "defending", title: "Interceptions", valueLabel: "Int", titleKey: "catInterceptionsTitle", valueLabelKey: "catInterceptionsValue" }, // prettier-ignore
  { key: "dribblesCompleted", group: "attacking", title: "Dribbles", valueLabel: "Dribbles", titleKey: "catDribblesTitle", valueLabelKey: "catDribblesValue" }, // prettier-ignore
  { key: "shotsOnTarget", group: "attacking", title: "Shots on Target", valueLabel: "SoT", titleKey: "catShotsOnTargetTitle", valueLabelKey: "catShotsOnTargetValue" }, // prettier-ignore
  { key: "xg", group: "attacking", title: "Expected Goals (xG)", valueLabel: "xG", titleKey: "catXgTitle", valueLabelKey: "catXgValue", decimals: 1 }, // prettier-ignore
  { key: "xa", group: "attacking", title: "Expected Assists (xA)", valueLabel: "xA", titleKey: "catXaTitle", valueLabelKey: "catXaValue", decimals: 1 }, // prettier-ignore
  { key: "yellowCards", group: "discipline", title: "Yellow Cards", valueLabel: "Yellow", titleKey: "catYellowCardsTitle", valueLabelKey: "catYellowCardsValue", accent: "yellow" }, // prettier-ignore
  { key: "redCards", group: "discipline", title: "Red Cards", valueLabel: "Red", titleKey: "catRedCardsTitle", valueLabelKey: "catRedCardsValue", accent: "red" }, // prettier-ignore
];

/**
 * Rank players by a metric. Drops null/≤0 values, sorts desc with a lower-id
 * tiebreak (deterministic, matching the committed leaderboards), takes top-N,
 * and rounds the displayed value when `decimals` is given (sort stays on the
 * raw value). Returns rows in the `<StatLeaderboard>` display shape.
 */
export function rankBy(
  players: Player[],
  key: MetricKey,
  opts: { n?: number; decimals?: number } = {},
): StatLeaderboardEntry[] {
  const { n = 10, decimals } = opts;
  const scored = players
    .map((p) => ({ p, v: metricValue(p, key) }))
    .filter((x): x is { p: Player; v: number } => typeof x.v === "number" && x.v > 0)
    .sort((a, b) => b.v - a.v || a.p.id - b.p.id)
    .slice(0, n);
  return scored.map(({ p, v }, i) => ({
    rank: i + 1,
    name: p.name,
    playerId: p.id,
    team: p.teamName,
    teamId: p.teamId,
    photo: p.photo ?? "",
    value: decimals !== undefined ? Number(v.toFixed(decimals)) : v,
  }));
}

/** Every category with ≥1 ranked row for this player set (empty boards omitted). */
export function buildBoards(
  players: Player[],
): Array<{ cat: LeaderboardCategory; rows: StatLeaderboardEntry[] }> {
  return LEADERBOARD_CATEGORIES.map((cat) => {
    const pool = cat.positions
      ? players.filter((p) => cat.positions!.includes(p.position))
      : players;
    return { cat, rows: rankBy(pool, cat.key, { decimals: cat.decimals }) };
  }).filter((b) => b.rows.length > 0);
}

export interface LeaderboardGroupBoards {
  group: LeaderboardGroup;
  /** Message key in the `leaderboard` namespace, e.g. "groupAttacking". */
  titleKey: string;
  boards: Array<{ cat: LeaderboardCategory; rows: StatLeaderboardEntry[] }>;
}

/**
 * `buildBoards`, split into display sections (TASK-M83).
 *
 * ⚠️ Layered ON TOP of `buildBoards` rather than replacing it — `/api/og/leaderboards`
 * calls that function too and must keep its flat list.
 *
 * ⛔ Empty groups are dropped, not rendered empty. A heading asserts that content exists,
 * and every season before 2008 would otherwise show five headings over nothing.
 */
export function buildGroupedBoards(players: Player[]): LeaderboardGroupBoards[] {
  const boards = buildBoards(players);
  return LEADERBOARD_GROUPS.map((group) => ({
    group,
    titleKey: `group${group[0]!.toUpperCase()}${group.slice(1)}`,
    boards: boards.filter((b) => b.cat.group === group),
  })).filter((g) => g.boards.length > 0);
}
