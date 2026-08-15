// the legacy wire (v3) response shapes.
// Extend as endpoints get wired up.
//
// Nullability and the two API typos (`appearences`, `commited`) are modeled
// from live PL 2024 payloads (topscorers/topassists/topyellowcards/
// topredcards + fixtures opener and final-day). Do not "correct" the typos
// — that would put the types out of sync with what the wire actually
// returns over the wire.

// TASK-M65: the profile stat-accordion's 66-field bag. Type-only re-export of
// the loader's inferred shape (defined once as a Zod schema in `@/data/schemas`)
// so the wire type and the validator can never drift across 54 fields.
import type { ExtendedMetrics } from "@/data/schemas";
export type { ExtendedMetrics };

export type ApiResponse<T> = {
  get: string;
  parameters: Record<string, string>;
  errors: unknown[];
  results: number;
  paging: Paging;
  response: T;
};

export type Paging = { current: number; total: number };

export type TeamRef = {
  id: number;
  name: string;
  logo: string;
};

// === Standings (TASK-204 consumer; existing) ============================

export type StandingsRow = {
  rank: number;
  team: TeamRef;
  points: number;
  goalsDiff: number;
  group: string;
  form: string;
  status: string;
  description: string | null;
  all: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
  home: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
  away: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
  update: string;
};

export type LeagueStandings = {
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string;
    season: number;
    standings: StandingsRow[][];
  };
};

// === Fixtures (TASK-203 / TASK-212 / TASK-213 consumers) ================

export type FixturePeriods = {
  first: number | null;
  second: number | null;
};

export type FixtureVenue = {
  id: number | null;
  name: string | null;
  city: string | null;
};

export type FixtureStatus = {
  long: string; // "Match Finished", "Not Started", "First Half", …
  short: string; // "FT", "NS", "1H", "2H", "HT", "ET", "P", "PEN", "CANC", "PST", "ABD", "SUSP", "INT"
  elapsed: number | null;
  extra: number | null;
};

export type FixtureInfo = {
  /**
   * Fixture identifier. The snapshot emits a human-readable string like
   * `"2024-08-16-MUN-FUL"`; the union also permits `number` for legacy
   * callers. TASK-508 widened this from `number`-only when the string id
   * became the canonical form across the dashboard rails, team-profile
   * recent-form strip, and `/fixtures/[id]` detail route.
   */
  id: number | string;
  referee: string | null;
  // TASK-M16: match attendance, joined read-time from data/fixture-extras-*.json
  // (legacy PL detail). Optional + nullable — only the /fixtures/[id] detail path
  // populates it; absent everywhere else.
  attendance?: number | null;
  timezone: string; // typically "UTC"
  date: string; // ISO 8601 with TZ offset, e.g. "2024-08-16T19:00:00+00:00"
  timestamp: number; // unix seconds
  periods: FixturePeriods;
  venue: FixtureVenue;
  status: FixtureStatus;
};

export type FixtureLeague = {
  id: number;
  name: string;
  country: string;
  logo: string;
  flag: string | null;
  season: number;
  round: string; // "Regular Season - 1"
  standings: boolean;
};

// Team reference inside a fixture also carries the match outcome.
// `winner: null` covers both pre-match and draws.
export type FixtureTeam = TeamRef & { winner: boolean | null };

export type FixtureTeams = {
  home: FixtureTeam;
  away: FixtureTeam;
};

// Used for `goals` and every sub-key of `score` (halftime/fulltime/extratime/
// penalty). All values are `number | null` because the API leaves them null
// before the relevant period has occurred.
export type ScoreLine = {
  home: number | null;
  away: number | null;
};

export type FixtureGoals = ScoreLine;

export type FixtureScore = {
  halftime: ScoreLine;
  fulltime: ScoreLine;
  extratime: ScoreLine;
  penalty: ScoreLine;
};

export type Fixture = {
  fixture: FixtureInfo;
  league: FixtureLeague;
  teams: FixtureTeams;
  goals: FixtureGoals;
  score: FixtureScore;
};

// === Fixture detail (TASK-212 / TASK-213 consumers) =====================
// Modeled from the wire v3 docs. Tighten against live captures when
// TASK-213 ships and exercises real fixtures (`tests/unit/api-types.test.ts`
// is the validation pattern). `null` allowed wherever the wire emits it
// in the live wire format for the existing Fixture types.

export type FixtureEventTime = {
  elapsed: number;
  extra: number | null;
};

export type FixtureEventActor = {
  id: number | null;
  name: string | null;
};

export type FixtureEvent = {
  time: FixtureEventTime;
  team: TeamRef;
  player: FixtureEventActor;
  assist: FixtureEventActor;
  type: "Goal" | "Card" | "subst" | "Var";
  detail: string;
  comments: string | null;
};

export type LineupPlayer = {
  id: number;
  name: string;
  number: number | null;
  pos: string | null;
  grid: string | null;
  isCaptain?: boolean; // TASK-M21 — armband marker (SDP + legacy)
  // Our stable /players/[id] id, resolved read-time by name ("M21"). null/absent
  // when the lineup name didn't match the season squad (graceful → plain text).
  profileId?: number | null;
};

export type LineupPlayerSlot = { player: LineupPlayer };

export type LineupTeamColors = {
  player: { primary: string; number: string; border: string };
  goalkeeper: { primary: string; number: string; border: string };
};

export type FixtureLineup = {
  team: TeamRef & { colors?: LineupTeamColors | null };
  coach: { id: number; name: string; photo: string | null; managerId?: string | null };
  formation: string;
  startXI: LineupPlayerSlot[];
  substitutes: LineupPlayerSlot[];
  // TASK-M47 — this side's resolved kit: dot fill + a contrasting number color.
  kit?: { fill: string; text: string } | null;
};

export type FixtureStatValue = number | string | null;
export type FixtureStatRow = { type: string; value: FixtureStatValue };

export type FixtureStatBlock = {
  team: TeamRef;
  statistics: FixtureStatRow[];
};

export type FixtureDetail = {
  fixture: Fixture;
  lineups: FixtureLineup[];
  statistics: FixtureStatBlock[];
  events: FixtureEvent[];
};

// === Players + statistics (TASK-202 leaderboards, Phase 3 player pages) =

export type PlayerBirth = {
  date: string; // "1992-06-15"
  place: string | null;
  country: string | null;
};

/**
 * TASK-M93 — the career summary already committed on every player row.
 *
 * `trophies` is SILVERWARE ONLY (see the schema note: 12,720 of TM's 29,761
 * honour groups are participation and 1,368 are runner-up, so a raw count would
 * rank a player who never won anything above a league winner).
 *
 * `caps` / `internationalGoals` are nullable and null means **unknown**, never
 * zero — an uncapped player and a player TM has no record for must not render
 * the same. `careerFee` is a pre-formatted display string ("€52.60m").
 */
export type PlayerEnrichment = {
  trophies: number;
  honours: number;
  awards: number;
  caps: number | null;
  internationalGoals: number | null;
  careerFee: string | null;
};

export type Player = {
  id: number;
  name: string;
  firstname: string;
  lastname: string;
  age: number;
  birth: PlayerBirth;
  nationality: string;
  height: string | null; // "175" — cm with unit dropped
  weight: string | null; // "71" — kg with unit dropped
  injured: boolean;
  photo: string;
  // TASK-M93. Absent/null = this row was never enriched — NOT "has no honours".
  enrichment?: PlayerEnrichment | null;
};

// Sub-shapes for `PlayerStatistics`. Every numeric field is nullable in the
// live payloads (the API uses null instead of 0 for "not measured"), and the
// `appearences` / `commited` typos are present in the wire format.
export type PlayerGames = {
  appearences: number | null; // [sic] — upstream typo, preserve as-is
  lineups: number | null;
  minutes: number | null;
  number: number | null;
  position: string | null; // "Attacker" | "Midfielder" | "Defender" | "Goalkeeper"
  rating: string | null; // "7.792105" — already a string
  captain: boolean;
};

export type PlayerSubstitutes = {
  in: number | null;
  out: number | null;
  bench: number | null;
};

export type PlayerShots = { total: number | null; on: number | null };

export type PlayerGoals = {
  total: number | null;
  conceded: number | null;
  assists: number | null;
  saves: number | null;
};

export type PlayerPasses = {
  total: number | null;
  key: number | null;
  accuracy: number | null;
};

export type PlayerTackles = {
  total: number | null;
  blocks: number | null;
  interceptions: number | null;
};

export type PlayerDuels = { total: number | null; won: number | null };

export type PlayerDribbles = {
  attempts: number | null;
  success: number | null;
  past: number | null;
};

export type PlayerFouls = {
  drawn: number | null;
  committed: number | null;
};

export type PlayerCards = {
  yellow: number | null;
  yellowred: number | null; // second-yellow → red
  red: number | null;
};

export type PlayerPenalty = {
  won: number | null;
  commited: number | null; // [sic] — upstream typo, preserve as-is
  scored: number | null;
  missed: number | null;
  saved: number | null;
};

// One entry in the wire's `response[0].statistics[]` array. The array
// holds one entry per competition the player appeared in for the given
// season; `/players/topscorers` etc. return a single-element array (the PL
// row), while `/players?id=&season=` can return many.
export type PlayerStatisticsEntry = {
  team: TeamRef;
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string | null;
    season: number;
  };
  games: PlayerGames;
  substitutes: PlayerSubstitutes;
  shots: PlayerShots;
  goals: PlayerGoals;
  passes: PlayerPasses;
  tackles: PlayerTackles;
  duels: PlayerDuels;
  dribbles: PlayerDribbles;
  fouls: PlayerFouls;
  cards: PlayerCards;
  penalty: PlayerPenalty;
};

// Leaderboard endpoints (topscorers / topassists / topyellowcards /
// topredcards) always return exactly one statistics entry per player —
// confirmed across 78/78 entries from live PL 2024 data. The wire format
// is still a `T[]`, so we type it as `readonly PlayerStatisticsEntry[]`
// rather than a 1-tuple: JSON literal types widen variable arrays to
// `T[]`, and using a tuple here would defeat the live-payload type-check
// that validates this module (see `tests/unit/api-types.test.ts`).
//
// The 1-entry invariant must be enforced by the fetcher (TASK-202): each
// leaderboard fetcher should assert `entry.statistics.length === 1` and
// either return a narrowed `[PlayerStatisticsEntry]` or throw on
// violation. `readonly` still buys some safety — consumers can't
// push/splice.
export type PlayerLeaderboardEntry = {
  player: Player;
  statistics: readonly PlayerStatisticsEntry[];
};

// Distinct aliases per leaderboard variant: structurally identical, but
// downstream call sites read better when the type name signals which
// ranking the data was sorted by.
export type TopScorerEntry = PlayerLeaderboardEntry;
export type TopAssistEntry = PlayerLeaderboardEntry;
export type TopCardsEntry = PlayerLeaderboardEntry;

// Narrow head-to-head metric set for the `/compare` page (TASK-401 / Phase
// 4). Flat shape so `<StatRow>` / `<RadarChart>` consumers don't have to
// reach through three levels of nesting per metric. Field names are
// normalized English (e.g. `appearances`). The loaders emit this shape
// directly — no rename adapter needed.
// `number | null` distinguishes "not measured" from `0`, which downstream
// consumers (`<StatRow>` neutral-bar fallback, radar normalisation in
// `src/features/players/normalize-for-radar.ts`) rely on.
export type ComparisonMetrics = {
  appearances: number | null;
  // Of which came on as a substitute (TASK-M39). Optional — only modern
  // seasons (2006+) carry it; surfaced as "Appearances (Sub)" on the profile.
  subAppearances?: number | null;
  goals: number | null;
  assists: number | null;
  passAccuracy: number | null;
  keyPasses: number | null;
  tackles: number | null;
  interceptions: number | null;
  duelsWon: number | null;
  dribblesCompleted: number | null;
  shotsOnTarget: number | null;
  yellowCards: number | null;
  redCards: number | null;
  // TASK-M20: expected goals + expected assists (xAG). Optional — only the
  // FBref (2017-24) + FPL (2025-26) eras carry them; null elsewhere.
  xg?: number | null;
  xa?: number | null;
  // TASK-M18: clean sheets (~2000-01+) + GK saves (~2006-07+) from the legacy
  // PL ranked endpoint. Optional/additive; null where the era/source has none.
  cleanSheets?: number | null;
  saves?: number | null;
  // TASK-M65: full 66-field bag for the profile stat accordion. Present only for
  // SDP-covered historical seasons the crawl has filled; null/absent elsewhere.
  extended?: ExtendedMetrics | null;
};

// === Teams + venue (TASK-301 / Phase 3 consumer) ========================
// `/teams?id={id}` returns a single `{ team, venue }` entry. the wire
// emits `null` (not omission) for unknown fields — `founded`, `code`, and
// every venue scalar except `id` can be null on the wire.

export type Venue = {
  id: number | null;
  name: string | null;
  address: string | null;
  city: string | null;
  capacity: number | null;
  surface: string | null;
  image: string | null;
};

export type Team = TeamRef & {
  code: string | null; // 3-letter abbreviation, e.g. "MUN"
  country: string;
  founded: number | null;
  national: boolean;
  /** TASK-M64 — official club website (clean origin), or null for defunct sides. */
  website: string | null;
};

export type TeamDetail = {
  team: Team;
  venue: Venue;
};

// === Squad (TASK-301 / TASK-302 consumer) ===============================
// `/players/squads?team={id}` returns a 1-entry array shaped
// `{ team, players[] }`. TASK-302's `getSquad` will unwrap to the players
// array; both shapes are exported so the fetcher can type the raw response
// before unwrapping.

export type SquadPlayer = {
  id: number;
  name: string;
  age: number | null; // SSR seed; <PlayerAge> refines living players live
  number: number | null;
  position: string | null; // "Goalkeeper" | "Defender" | "Midfielder" | "Attacker"
  photo: string | null;
  // TASK-M15: country name + flag-icons code (null when unknown).
  nationality: string | null;
  nationalityCode: string | null;
  // TASK-M40: birth date drives the live client age; date of death (null for
  // living) drives the frozen age + the deceased visual treatment.
  birthDate: string | null;
  dateOfDeath: string | null;
  // TASK-M41: this player captained the team that season (armband marker).
  isCaptain: boolean;
  // TASK-M93: trophy + cap counts for the squad card. Null = unenriched row.
  enrichment?: PlayerEnrichment | null;
};

export type SquadEntry = {
  team: TeamRef;
  players: SquadPlayer[];
};

// === Team statistics (TASK-301 / TASK-302 consumer) =====================
// `/teams/statistics?league=39&season={s}&team={id}` returns a wide payload
// with form/fixtures/goals/biggest/clean_sheet/failed_to_score/penalty/
// lineups/cards. Per the TASK-301 spec we only model the subset Phase 3
// consumes: `goals.for`, `goals.against`, `clean_sheet.total`,
// `failed_to_score.total`, `biggest.streak`, `lineups`. Extra wire keys
// are permitted by TS structural typing — fetchers will simply ignore
// them. Numeric fields are nullable because the wire uses `null` for
// "not measured" (consistent with the `PlayerStatistics` precedent).

export type TeamStatsHomeAwayTotal = {
  home: number | null;
  away: number | null;
  total: number | null;
};

export type TeamStatsGoals = {
  total: TeamStatsHomeAwayTotal;
};

export type TeamStatsStreak = {
  wins: number | null;
  draws: number | null;
  loses: number | null; // [sic] — upstream spelling, preserve as-is
};

export type TeamStatsLineup = {
  formation: string;
  played: number;
};

export type TeamStats = {
  goals: {
    for: TeamStatsGoals;
    against: TeamStatsGoals;
  };
  clean_sheet: { total: number | null };
  failed_to_score: { total: number | null };
  biggest: {
    streak: TeamStatsStreak;
  };
  lineups: TeamStatsLineup[];
  // TASK-M17: season aggregates derived from the committed fixtures (results +
  // per-match `teamStats`). Optional so existing mocks/consumers stay valid;
  // `getTeamStats` always populates them. Per-game + card fields are `null`
  // pre-2000 (no per-match stats); `longestUnbeaten` works for every season.
  longestUnbeaten?: number | null;
  perGame?: {
    shots: number | null;
    shotsOnTarget: number | null;
    corners: number | null;
    fouls: number | null;
  };
  cards?: { yellow: number | null; red: number | null };
};
