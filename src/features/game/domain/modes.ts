/**
 * The game's mode roster — pure data, no imports, no entropy.
 *
 * ⚠️ Phase 18 locked "the seven modes are rule packs (data), not seven code paths". This
 * file is the UI half of that rule: the gate renders from this table and never branches on
 * a mode's identity. Shipping a mode later flips a status and sets an href; no component
 * changes.
 *
 * ⚠️ Labels are i18n KEYS, never literals. The CI AST guard rejects hardcoded strings in
 * `features/game/`, and a literal here would ship English into the Arabic gate.
 *
 * See docs/superpowers/specs/2026-08-13-task-1832-game-hub-design.md.
 */

export type ModeId =
  | "h2h"
  | "chaos"
  | "captains"
  | "budget"
  | "chemistry"
  | "legacy"
  | "classic"
  | "daily"
  | "weekly"
  | "whatIf"
  | "mystery";

/**
 * How long a session runs.
 *
 * Orthogonal to the mode (TASK-1832 D5): the season engine is opponent-agnostic and the
 * active mode's rule pack supplies the league, so any mode can in principle run either
 * length. What a given mode actually supports is declared per-mode below.
 */
export type GameFormat = "single" | "season";

/**
 * What a mode offers for a given format.
 *
 * ⭐ `n/a` is NOT a weaker "planned" (owner, 2026-08-24): it means the format makes no
 * sense for this mode and will never arrive, so the gate must not advertise it at all. The
 * daily is the case that forced the distinction — a season-long "one challenge per day" is
 * a contradiction, and showing it as a locked Full Season box promised something that was
 * never coming.
 */
export type ModeStatus = "live" | "planned" | "n/a";

export type ModeGroupId = "quickPlay" | "draftPacks" | "challenges";

export interface GameMode {
  id: ModeId;
  group: ModeGroupId;
  emoji: string;
  nameKey: string;
  descriptionKey: string;
  /**
   * The mode's entry route. One route serves every live format — the format does not
   * change where you land today (D11: no `?format=` param, because nothing would read it).
   * `null` while every format is `planned`.
   */
  href: string | null;
  formats: Record<GameFormat, ModeStatus>;
  /**
   * The mode's own colour, as a hex literal (TASK-1833).
   *
   * ⚠️ Presentation, and it sits here for the same reason `emoji` does: the gate renders
   * entirely from this table, so a mode's identity — its mark, its name, its colour — has
   * to arrive with it. A component-side lookup keyed by `ModeId` would be a second
   * registry that could silently fall out of step with this one.
   *
   * ⛔ NOT an i18n key and not a token name. It is a raw value because the gate paints it
   * into a CSS custom property per tile; there is no palette slot for "the eleventh mode".
   */
  accent: string;
  /** The ticket that makes this mode live. Documentation only. */
  ticket: string;
}

export interface ModeGroup {
  id: ModeGroupId;
  labelKey: string;
}

export interface CollectionSurface {
  id: string;
  emoji: string;
  nameKey: string;
  status: ModeStatus;
  ticket: string;
}

export const MODE_GROUPS: readonly ModeGroup[] = [
  { id: "quickPlay", labelKey: "groupQuickPlay" },
  { id: "draftPacks", labelKey: "groupDraftPacks" },
  { id: "challenges", labelKey: "groupChallenges" },
];

const planned: Record<GameFormat, ModeStatus> = { single: "planned", season: "planned" };

export const GAME_MODES: readonly GameMode[] = [
  {
    // ⚠️ The existing /game/draft loop, renamed — no new engine code. The name is chosen to
    // survive Phase 19: when accounts and matchmaking exist this mode expands to real PvP
    // and the tile does not have to be renamed.
    id: "h2h",
    group: "quickPlay",
    emoji: "🧠",
    nameKey: "modeH2hName",
    descriptionKey: "modeH2hDesc",
    href: "/game/draft",
    formats: { single: "live", season: "planned" },
    accent: "#22d3ee",
    ticket: "TASK-1807",
  },
  {
    id: "chaos",
    group: "quickPlay",
    emoji: "🔥",
    nameKey: "modeChaosName",
    descriptionKey: "modeChaosDesc",
    href: "/game/chaos",
    formats: { single: "live", season: "planned" },
    accent: "#ff6b35",
    ticket: "TASK-1806",
  },
  {
    id: "captains",
    group: "draftPacks",
    emoji: "👑",
    nameKey: "modeCaptainsName",
    descriptionKey: "modeCaptainsDesc",
    href: "/game/captains",
    formats: { single: "live", season: "planned" },
    accent: "#e0b341",
    ticket: "TASK-1810",
  },
  {
    id: "budget",
    group: "draftPacks",
    emoji: "💰",
    nameKey: "modeBudgetName",
    descriptionKey: "modeBudgetDesc",
    // ⚠️ A bespoke route, not the parameterised `/game/[mode]` one — the pack declares no
    // chooser, so `routedPacks()` deliberately excludes it. See `BUDGET_PACK`.
    href: "/game/budget",
    // TASK-1810 ships the single-match format. Season is TASK-1811 — the registry's
    // per-format status is exactly what lets those ship in separate PRs.
    formats: { single: "live", season: "planned" },
    accent: "#34d399",
    ticket: "TASK-1810",
  },
  {
    id: "chemistry",
    group: "draftPacks",
    emoji: "🔗",
    nameKey: "modeChemistryName",
    descriptionKey: "modeChemistryDesc",
    href: null,
    formats: planned,
    accent: "#a78bfa",
    ticket: "TASK-1810",
  },
  {
    id: "legacy",
    group: "draftPacks",
    emoji: "🏛️",
    nameKey: "modeLegacyName",
    descriptionKey: "modeLegacyDesc",
    // ⚠️ Served by the parameterised `/game/[mode]` route, not a route of its own — the
    // segment only resolves because a rule pack backs the id, which `game-modes.test.ts`
    // asserts separately from "the route file exists".
    href: "/game/legacy",
    // TASK-1810 ships the single-match format. "Season by season" is TASK-1811 — the
    // registry's per-format status is exactly what lets those ship in separate PRs.
    formats: { single: "live", season: "planned" },
    accent: "#f6c000",
    ticket: "TASK-1810",
  },
  {
    // ⚠️ "Classic", NOT "Classic Season" (TASK-1832 D7) — the format decides length, so a
    // name carrying the format makes "Classic Season → One Match" incoherent. Survival is
    // deliberately absent for the same reason: it is an OBJECTIVE on the Season format,
    // owned by TASK-1811, not a mode.
    id: "classic",
    group: "draftPacks",
    emoji: "🎩",
    nameKey: "modeClassicName",
    descriptionKey: "modeClassicDesc",
    href: null,
    formats: planned,
    accent: "#9fb3c8",
    ticket: "TASK-1810",
  },
  {
    id: "daily",
    group: "challenges",
    emoji: "📅",
    nameKey: "modeDailyName",
    descriptionKey: "modeDailyDesc",
    href: "/game/daily",
    // A season-long daily is a contradiction, so the format is `n/a` rather than
    // `planned`: the tile links straight into today's challenge instead of expanding.
    formats: { single: "live", season: "n/a" },
    accent: "#ff2fb0",
    ticket: "TASK-1817",
  },
  {
    id: "weekly",
    group: "challenges",
    emoji: "🗓️",
    nameKey: "modeWeeklyName",
    descriptionKey: "modeWeeklyDesc",
    href: null,
    formats: planned,
    accent: "#a3e635",
    ticket: "TASK-1828",
  },
  {
    id: "whatIf",
    group: "challenges",
    emoji: "⏳",
    nameKey: "modeWhatIfName",
    descriptionKey: "modeWhatIfDesc",
    href: null,
    formats: planned,
    accent: "#2dd4bf",
    ticket: "TASK-1816",
  },
  {
    id: "mystery",
    group: "challenges",
    emoji: "🎲",
    nameKey: "modeMysteryName",
    descriptionKey: "modeMysteryDesc",
    href: null,
    formats: planned,
    accent: "#c084fc",
    ticket: "TASK-1818",
  },
];

/** Not modes — they render in their own strip at the foot of the gate. */
export const COLLECTION_SURFACES: readonly CollectionSurface[] = [
  {
    id: "records",
    emoji: "📊",
    nameKey: "collectionRecords",
    status: "planned",
    ticket: "TASK-1812",
  },
  {
    id: "hallOfFame",
    emoji: "🥇",
    nameKey: "collectionHallOfFame",
    status: "planned",
    ticket: "TASK-1813",
  },
  {
    id: "album",
    emoji: "🖼️",
    nameKey: "collectionAlbum",
    status: "planned",
    ticket: "TASK-1819",
  },
];

/** The formats a tile offers, in display order. */
export const GAME_FORMATS: readonly GameFormat[] = ["single", "season"];

export const isPlayable = (mode: GameMode): boolean =>
  mode.href != null && Object.values(mode.formats).some((s) => s === "live");

/** The formats worth showing for a mode — `n/a` ones are not a choice the player has. */
export const applicableFormats = (mode: GameMode): GameFormat[] =>
  GAME_FORMATS.filter((f) => mode.formats[f] !== "n/a");

/**
 * Does this tile go straight in, with no format to choose?
 *
 * True when a playable mode has exactly ONE applicable format — there is nothing to pick,
 * so an expander would add a click on the way to the only destination.
 */
export const isDirectEntry = (mode: GameMode): boolean =>
  isPlayable(mode) && applicableFormats(mode).length === 1;

export const modesInGroup = (group: ModeGroupId): GameMode[] =>
  GAME_MODES.filter((m) => m.group === group);
