import { z } from "zod";

/** Per-season entity row counts. One of these per committed season. */
export const RowCountsSchema = z.object({
  standings: z.number().int().nonnegative(),
  teams: z.number().int().nonnegative(),
  players: z.number().int().nonnegative(),
  fixtures: z.number().int().nonnegative(),
  leaderboards: z.number().int().nonnegative(),
});

export const MetaSchema = z.object({
  lastRefresh: z.string(),
  datasets: z.array(
    z.object({
      slug: z.string(),
      downloadedAt: z.string(),
    }),
  ),
  // Seasons with committed data, newest-first (TASK-701). Powers TASK-702's
  // getAvailableSeasons() so the switcher only offers seasons that actually exist.
  seasons: z.array(z.number().int()),
  // Per-season entity row counts, keyed by the season-string (e.g. "2024").
  // Was a single flat object pre-TASK-701 (single committed season).
  rowCounts: z.record(z.string(), RowCountsSchema),
});

export const StandingSchema = z.object({
  rank: z.number().int().positive(),
  teamId: z.number().int().positive(),
  teamName: z.string(),
  played: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
  drawn: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
  goalsFor: z.number().int().nonnegative(),
  goalsAgainst: z.number().int().nonnegative(),
  goalsDiff: z.number().int(),
  points: z.number().int().nonnegative(),
});

export const TeamSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  code: z.string().length(3),
  founded: z.number().int().positive(),
  venue: z.string(),
  capacity: z.number().int().positive(),
  logo: z.string(),
});

const TeamMatchStatsSchema = z.object({
  shots: z.number().int().nonnegative(),
  shotsOnTarget: z.number().int().nonnegative(),
  corners: z.number().int().nonnegative(),
  fouls: z.number().int().nonnegative(),
  yellowCards: z.number().int().nonnegative(),
  redCards: z.number().int().nonnegative(),
});

export const FixtureSchema = z.object({
  id: z.string(),
  date: z.string(),
  homeTeamId: z.number().int().positive(),
  awayTeamId: z.number().int().positive(),
  homeTeamName: z.string(),
  awayTeamName: z.string(),
  homeScore: z.number().int().nullable(),
  awayScore: z.number().int().nullable(),
  venue: z.string(),
  teamStats: z
    .object({
      home: TeamMatchStatsSchema,
      away: TeamMatchStatsSchema,
    })
    .nullable(),
  // TASK-1301: half-time score (from 1995-96) + referee (from 2000-01).
  // Both null when unavailable.
  halfTime: z
    .object({
      home: z.number().int(),
      away: z.number().int(),
    })
    .nullable(),
  referee: z.string().nullable(),
});

// TASK-M65: the full SDP v2 payload beyond the flat core — 54 fields the
// `pitchiq-pipeline` historical crawl lands under `metrics.extended`, grouped by
// the 10 categories the profile's stat accordion renders. Additive + isolated:
// the core axes above (the ones /compare, radar, leaderboards + OG cards read)
// are untouched, and every field is `int | null` (null = the era/source did not
// measure it, distinct from a real 0). Kept in lockstep with the pipeline's
// `ExtendedMetrics` (scripts/sync-kaggle-data/sdp-extended-stats.ts).
const intNull = () => z.number().int().nullable();
export const ExtendedMetricsSchema = z.object({
  // Playing time
  gamesPlayed: intNull(),
  starts: intNull(),
  substituteOn: intNull(),
  substituteOff: intNull(),
  minutesPlayed: intNull(),
  // Shooting
  totalShots: intNull(),
  shotsOffTarget: intNull(),
  blockedShots: intNull(),
  headedGoals: intNull(),
  leftFootGoals: intNull(),
  homeGoals: intNull(),
  awayGoals: intNull(),
  winningGoals: intNull(),
  offsides: intNull(),
  setPieceAttempts: intNull(),
  // Passing
  totalPasses: intNull(),
  openPlayPasses: intNull(),
  successfulShortPasses: intNull(),
  unsuccessfulShortPasses: intNull(),
  successfulLongPasses: intNull(),
  unsuccessfulLongPasses: intNull(),
  successfulPassesOwnHalf: intNull(),
  unsuccessfulPassesOwnHalf: intNull(),
  successfulPassesOppositionHalf: intNull(),
  unsuccessfulPasses: intNull(),
  touches: intNull(),
  possessionLost: intNull(),
  throwIns: intNull(),
  // Crossing & corners
  successfulCrossesOpenPlay: intNull(),
  unsuccessfulCrossesOpenPlay: intNull(),
  successfulCrossesAndCorners: intNull(),
  unsuccessfulCrossesAndCorners: intNull(),
  cornersTaken: intNull(),
  cornersWon: intNull(),
  // Dribbling
  unsuccessfulDribbles: intNull(),
  timesDispossessed: intNull(),
  // Duels
  duels: intNull(),
  duelsLost: intNull(),
  groundDuels: intNull(),
  groundDuelsWon: intNull(),
  groundDuelsLost: intNull(),
  // Defending
  tacklesWon: intNull(),
  tacklesLost: intNull(),
  clearances: intNull(),
  blocks: intNull(),
  foulsWon: intNull(),
  // Discipline
  straightRedCards: intNull(),
  foulsConceded: intNull(),
  penaltiesConceded: intNull(),
  handballsConceded: intNull(),
  // Goals against / GK
  goalsConceded: intNull(),
  goalsConcededInsideBox: intNull(),
  goalsConcededOutsideBox: intNull(),
  penaltyGoalsConceded: intNull(),
});

export const ComparisonMetricsSchema = z.object({
  appearances: z.number().int().nullable(),
  // Of which came on as a substitute (TASK-M39, official PL API `total_sub_on`).
  // Optional so the source transforms that don't set it omit it (the committed
  // sub-appearances map fills it); a profile shows "35 (2)" when present.
  subAppearances: z.number().int().nullable().optional(),
  goals: z.number().int().nullable(),
  assists: z.number().int().nullable(),
  passAccuracy: z.number().nullable(),
  keyPasses: z.number().int().nullable(),
  tackles: z.number().int().nullable(),
  interceptions: z.number().int().nullable(),
  duelsWon: z.number().int().nullable(),
  dribblesCompleted: z.number().int().nullable(),
  shotsOnTarget: z.number().int().nullable(),
  yellowCards: z.number().int().nullable(),
  redCards: z.number().int().nullable(),
  // TASK-M20: expected goals + expected assists. Optional/additive + non-int
  // (floats, 1dp) — null for the eras whose data carries no xG.
  xg: z.number().nullable().optional(),
  xa: z.number().nullable().optional(),
  // TASK-M18: clean sheets (per-player, ~2000-01+) + GK saves (~2006-07+).
  // Optional/additive like subAppearances/xg — null where the era has none.
  // Surfaced on the /leaderboards page.
  cleanSheets: z.number().int().nullable().optional(),
  saves: z.number().int().nullable().optional(),
  // TASK-M65: the full 66-field bag for the profile stat accordion. Optional —
  // present only for the SDP-covered historical seasons the crawl has filled.
  extended: ExtendedMetricsSchema.optional(),
});

// TASK-M07: one club's slice of a player's season — emitted only for a
// mid-season transferee (the 2017-24 era carries a row per club).
// The 5 universal counting stats only; rate metrics (passAccuracy) don't
// sum per-club and are omitted. Per-split stats sum to the aggregate `metrics`.
export const PlayerSeasonSplitSchema = z.object({
  teamId: z.number().int().positive(),
  teamName: z.string(),
  appearances: z.number().int().nonnegative().nullable(),
  goals: z.number().int().nonnegative().nullable(),
  assists: z.number().int().nonnegative().nullable(),
  yellowCards: z.number().int().nonnegative().nullable(),
  redCards: z.number().int().nonnegative().nullable(),
});

// TASK-M56: the true positional role (LB/CB/CDM/…) enriched from Transfermarkt,
// far finer than the coarse 4-value `position`. A closed vocabulary; the pipeline
// maps TM's strings onto it (an unmapped TM term is a hard error, never a guess).
export const PlayerRoleSchema = z.enum([
  "GK",
  "RB",
  "CB",
  "LB",
  "CDM",
  "CM",
  "CAM",
  "RM",
  "LM",
  "RW",
  "LW",
  "SS",
  "CF",
]);
export type PlayerRole = z.infer<typeof PlayerRoleSchema>;

// Provenance of a player-season's role. `enriched` = TM career label (the baseline
// this ticket ships); `grid` = a per-season 2017+ refinement from the lineup grid;
// `coarse` = last-resort fallback to the 4-value line. Ships so the game/UI can be
// honest about where a role came from.
export const RoleSourceSchema = z.enum(["enriched", "grid", "coarse"]);
export type RoleSource = z.infer<typeof RoleSourceSchema>;

/**
 * The ONLY eligibility rule for the game draft (TASK-M56, owner decision): a hard
 * ban, not a penalty tier. A player may occupy their primary `role` or any of their
 * `altRoles` — nothing else. A `null` role (unenriched player) is ineligible
 * everywhere. This is why `altRoles` is correctness-critical, not flavour: an
 * over-narrow scrape makes a real squad unbuildable.
 */
export function canPlay(
  p: { role: PlayerRole | null; altRoles: PlayerRole[] },
  slot: PlayerRole,
): boolean {
  return p.role === slot || p.altRoles.includes(slot);
}

export const PlayerSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  teamId: z.number().int().positive(),
  teamName: z.string(),
  position: z.enum(["Goalkeeper", "Defender", "Midfielder", "Forward"]),
  photo: z.string().nullable(),
  // TASK-M15: birth + nationality. All optional/additive — existing committed
  // files validate unchanged. `birthDate` (full ISO) is present where a bio
  // match succeeds; `birthYear` is the universal age fallback.
  birthDate: z.string().nullable().optional(),
  birthYear: z.number().int().nullable().optional(),
  nationality: z.string().nullable().optional(),
  nationalityCode: z.string().nullable().optional(),
  // TASK-M40: ISO date of death, null/absent for living players. Drives the
  // "until death" age + the deceased visual.
  dateOfDeath: z.string().nullable().optional(),
  metrics: ComparisonMetricsSchema,
  // TASK-M07: per-club breakdown for a mid-season transferee (2017-24 era);
  // undefined for single-club seasons. Additive — aggregate `metrics`/`teamId`
  // and the id registry are unchanged.
  splits: z.array(PlayerSeasonSplitSchema).optional(),
  // TASK-M56: true positional role + alternates + foot, enriched from
  // Transfermarkt. All optional/additive — a pre-enrichment committed row
  // validates unchanged; `altRoles` defaults to [] so consumers never see
  // undefined. `role` null = not yet enriched. Eligibility (canPlay) reads
  // `role` + `altRoles`.
  // Optional (not `.default([])`) to stay a pure additive superset — forcing it
  // required would break every existing Player literal + the mirrored type in
  // src/types/api.ts. An enriched row always carries it; consumers normalize
  // `altRoles ?? []` (canPlay takes an already-normalized shape).
  role: PlayerRoleSchema.nullable().optional(),
  altRoles: z.array(PlayerRoleSchema).optional(),
  foot: z.enum(["left", "right", "both"]).nullable().optional(),
  roleSource: RoleSourceSchema.optional(),
  // TASK-M56: height in cm, enriched from Transfermarkt alongside the role.
  // Additive/optional; null when TM lists no height.
  height: z.number().int().nullable().optional(),
  // TASK-M75: Transfermarkt enrichment summary, applied from the private M73 maps.
  // Optional + additive — a pre-enrichment committed row validates unchanged, and
  // absence means "not enriched", never "has none".
  //
  // `trophies` counts SILVERWARE ONLY. 12,720 of the 29,761 honour groups TM lists are
  // participation and 1,368 are runner-up, so a naive count would rank a player who never
  // won anything above a league winner. Detail (every honour, transfer and cap, with the
  // per-group kind) lives in data/player-honours.json and friends, read only by the pages
  // that show it — see loadPlayerHonours().
  enrichment: z
    .object({
      trophies: z.number().int(),
      honours: z.number().int(),
      awards: z.number().int(),
      caps: z.number().int().nullable(),
      internationalGoals: z.number().int().nullable(),
      /** Display string ("€52.60m"), never a number. */
      careerFee: z.string().nullable(),
    })
    .nullable()
    .optional(),
});

// TASK-M75: enrichment detail, keyed by player id. Split out of the player rows so
// players-<season>.json — which the whole app builds from — stays small.
export const PlayerHonourGroupSchema = z.object({
  title: z.string(),
  count: z.number().int(),
  kind: z.enum(["trophy", "award", "promotion", "relegation", "runner-up", "participation"]),
  entries: z.array(
    z.object({ season: z.string(), club: z.string().nullable(), clubId: z.string().nullable() }),
  ),
});
export const PlayerHonoursFileSchema = z.record(
  z.string(),
  z.object({ groups: z.array(PlayerHonourGroupSchema) }),
);
export type PlayerHonoursFile = z.infer<typeof PlayerHonoursFileSchema>;

export const PlayerTransferHistoryFileSchema = z.record(
  z.string(),
  z.object({
    feeSum: z.string().nullable(),
    moves: z.array(
      z.object({
        season: z.string().nullable(),
        date: z.string().nullable(),
        /** Display string — "€24.00m", "free transfer", "End of loan", "?" — never a number. */
        fee: z.string().nullable(),
        from: z.string().nullable(),
        fromId: z.string().nullable(),
        to: z.string().nullable(),
        toId: z.string().nullable(),
      }),
    ),
  }),
);
export type PlayerTransferHistoryFile = z.infer<typeof PlayerTransferHistoryFileSchema>;

export const PlayerNationalFileSchema = z.record(
  z.string(),
  z.object({
    caps: z.number().int().nullable(),
    goals: z.number().int().nullable(),
    spells: z.array(
      z.object({
        teamId: z.string().nullable(),
        matches: z.number().int().nullable(),
        goals: z.number().int().nullable(),
        debutDate: z.string().nullable(),
      }),
    ),
  }),
);
export type PlayerNationalFile = z.infer<typeof PlayerNationalFileSchema>;

// TASK-M78: manager enrichment, keyed by OUR manager id (numeric-string for a manager
// with a Premier League id, `lm-<slug>` for a legacy-only one). Three separate files
// rather than a block on the manager rows: `managers.json` is keyed by
// (season → teamId → entries), so a career-level fact would be duplicated across every
// season row a manager appears in.
//
// ⚠️ The published basenames are `manager-enrichment` / `manager-career-history` /
// `manager-honours-history` — deliberately NOT `manager-career.json` or
// `manager-honours.json`, which are PRIVATE pipeline maps. `sync-data.yml` strips every
// pipeline-data basename from this repo, so a colliding name would be deleted on the
// next sync (the `player-transfer-history.json` rule).
export const ManagerEnrichmentSummarySchema = z.object({
  /** Silverware only — individual awards ("Manager of the Year") are NOT counted here. */
  trophies: z.number().int(),
  /** Every honour group, however classified. */
  honours: z.number().int(),
  awards: z.number().int(),
  /** Distinct clubs where Transfermarkt recorded a managerial record. */
  clubsManaged: z.number().int(),
  careerMatches: z.number().int(),
  careerWins: z.number().int(),
  careerDraws: z.number().int(),
  careerLosses: z.number().int(),
  /** `(3W + D) / M`, 2dp. **null when there is no record — never 0.** */
  careerPpm: z.number().nullable(),
});
export const ManagerEnrichmentFileSchema = z.record(z.string(), ManagerEnrichmentSummarySchema);
export type ManagerEnrichmentFile = z.infer<typeof ManagerEnrichmentFileSchema>;

export const ManagerCareerSpellSchema = z.object({
  club: z.string().nullable(),
  clubId: z.string().nullable(),
  /** As Transfermarkt writes it — "Manager", "Assistant Manager", "Player-Coach", … */
  role: z.string().nullable(),
  appointedSeason: z.string().nullable(),
  appointedDate: z.string().nullable(),
  /** Verbatim end cell — may read "expected 30/06/2027" for a current job. */
  until: z.string().nullable(),
  untilDate: z.string().nullable(),
  ongoing: z.boolean(),
  /** ⚠️ null when Transfermarkt printed `-`. Absent is NOT zero. */
  matches: z.number().int().nullable(),
  wins: z.number().int().nullable(),
  draws: z.number().int().nullable(),
  losses: z.number().int().nullable(),
  daysInCharge: z.number().int().nullable(),
  playersUsed: z.number().int().nullable(),
  /** Verbatim "1.40 : 1.40" — goals for : against per match. Two numbers in one cell. */
  goalsPerMatch: z.string().nullable(),
  /** ⚠️ 0 on a spell with no match record — read it with `matches`, never alone. */
  ppm: z.number().nullable(),
  assistantTo: z.string().nullable(),
});
export const ManagerCareerHistoryFileSchema = z.record(
  z.string(),
  z.object({ tmId: z.string(), spells: z.array(ManagerCareerSpellSchema) }),
);
export type ManagerCareerHistoryFile = z.infer<typeof ManagerCareerHistoryFileSchema>;

export const ManagerHonourGroupSchema = z.object({
  title: z.string(),
  count: z.number().int(),
  kind: z.enum(["trophy", "award", "promotion", "relegation", "runner-up", "participation"]),
  entries: z.array(
    z.object({
      /** Raw Transfermarkt season string — "25/26" or "2019". Not normalized. */
      season: z.string(),
      /** For a manager the honour cell carries the COMPETITION, not a club. */
      competition: z.string().nullable(),
      competitionId: z.string().nullable(),
    }),
  ),
});
export const ManagerHonoursHistoryFileSchema = z.record(
  z.string(),
  z.object({ tmId: z.string(), titles: z.array(ManagerHonourGroupSchema) }),
);
export type ManagerHonoursHistoryFile = z.infer<typeof ManagerHonoursHistoryFileSchema>;

export const LeaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  playerId: z.number().int().positive(),
  playerName: z.string(),
  teamId: z.number().int().positive(),
  teamName: z.string(),
  value: z.number(),
});

export const LeaderboardsSchema = z.object({
  topScorers: z.array(LeaderboardEntrySchema),
  topAssists: z.array(LeaderboardEntrySchema),
  topYellowCards: z.array(LeaderboardEntrySchema),
  topRedCards: z.array(LeaderboardEntrySchema),
});

// === Lineups + match events (Phase 10 — TheSportsDB) ====================

const LineupPlayerRawSchema = z.object({
  id: z.number().int(), // TheSportsDB idPlayer (numeric, unique within a match)
  name: z.string(),
  number: z.number().int().nullable(),
  pos: z.string().nullable(),
  grid: z.string().nullable(), // "row:col" synthesized from pos; null → bench
  isCaptain: z.boolean().optional(), // TASK-M21 — emitted only when true (armband)
});

const TeamLineupRawSchema = z.object({
  teamId: z.number().int().positive(), // OUR team id
  formation: z.string(), // "" when indeterminate
  startXI: z.array(LineupPlayerRawSchema),
  substitutes: z.array(LineupPlayerRawSchema),
  manager: z.string().nullable().optional(), // TASK-M21 — SDP era only; legacy omits
});

export const FixtureLineupsSchema = z.object({
  home: TeamLineupRawSchema,
  away: TeamLineupRawSchema,
});

/** lineups-<season>.json: keyed by fixture id. */
export const LineupsFileSchema = z.record(z.string(), FixtureLineupsSchema);

export const MatchEventRawSchema = z.object({
  type: z.enum(["Goal", "Card", "subst", "Var"]),
  detail: z.string(),
  minute: z.number().int().nonnegative(),
  extra: z.number().int().nullable(),
  teamId: z.number().int().positive(), // OUR team id
  player: z.string().nullable(),
  assist: z.string().nullable(),
});

/** events-<season>.json: keyed by fixture id → ordered event list. */
export const EventsFileSchema = z.record(z.string(), z.array(MatchEventRawSchema));

// === Cross-season search index (TASK-M08) ===============================

/**
 * search-index.json: one entry per stable id across ALL committed seasons, so
 * the global ⌘K search finds historical players/clubs regardless of the active
 * season. Each entry carries the NEWEST season the entity appears in (its latest
 * name/club/photo) — the link target so the result lands on a season with data.
 */
export const SearchIndexSchema = z.object({
  players: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      teamId: z.number().int().positive(),
      teamName: z.string(),
      photo: z.string().nullable(),
      latestSeason: z.number().int(),
      // Prominence signals for search ranking (TASK-M29), summed across ALL the
      // player's seasons: `ga` = goals + assists (primary), `apps` = appearances
      // (tiebreak — keeps famous defenders/keepers near the top despite low g+a).
      ga: z.number().int().nonnegative(),
      apps: z.number().int().nonnegative(),
      // Curated search nicknames (TASK-M30) — optional + omitted for the ~5,000
      // players without one, so the committed index stays lean. Initials (kdb,
      // rvp) are derived at query time and NOT stored here.
      aliases: z.array(z.string()).optional(),
      // TASK-1606: Arabic display name (present only when a `names-ar` map covers
      // this id) — lets ⌘K match Arabic queries + render Arabic on /ar.
      nameAr: z.string().optional(),
    }),
  ),
  teams: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      latestSeason: z.number().int(),
      nameAr: z.string().optional(),
    }),
  ),
  // Managers in the cross-season palette (TASK-M51 follow-up). Manager ids are
  // STRINGS (numeric PL id for modern managers, `lm-<slug>` for legacy-only ones)
  // — distinct from the numeric player/team ids above. `.default([])` keeps an
  // older committed index (built before this field existed) parseable.
  managers: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        photo: z.string().nullable(),
        latestSeason: z.number().int(),
        nameAr: z.string().optional(),
      }),
    )
    .default([]),
});

// TASK-1606: an Arabic-name sidecar map — stable id (string) → Arabic name.
// One file per entity type under `data/i18n/names-ar/`; applied by active locale.
export const ArNameMapSchema = z.record(z.string(), z.string());
export type ArNameMap = z.infer<typeof ArNameMapSchema>;

// === Pipeline-produced override/enrichment maps ===========================
// These describe committed sidecar maps the external data pipeline uses to
// bake values into the per-season files. They are part of the shared write-side
// contract (the pipeline overlays its scripts onto this repo and imports these),
// so they live here even though the read side doesn't load them directly.

// Official season-metrics override map for the latest season (id → metrics).
export const OfficialStatsFileSchema = z.record(z.string(), ComparisonMetricsSchema);

// Substitute-appearance counts: season (string) → player id (string) → count.
export const SubAppearancesFileSchema = z.record(
  z.string(),
  z.record(z.string(), z.number().int()),
);

// Expected goals + expected assists: season → id → { xg, xa }.
export const PlayerXgFileSchema = z.record(
  z.string(),
  z.record(z.string(), z.object({ xg: z.number().nullable(), xa: z.number().nullable() })),
);

// Clean sheets + saves: season (string) → player id (string) → { cleanSheets, saves }.
export const GkStatsFileSchema = z.record(
  z.string(),
  z.record(
    z.string(),
    z.object({
      cleanSheets: z.number().int().nullable(),
      saves: z.number().int().nullable(),
    }),
  ),
);

// TASK-M65 (cron-safety): the SDP-derived history stats — season → id → the 7
// advanced core metrics + the full `extended` bag. The `derivePlayers` seasons
// (2010-16) regenerate every cron from lineups (base only), so this committed
// map is re-applied over them (like xG/GK) to keep the advanced + extended stats
// through a refresh. Built by `sync:data:official-stats-history`.
export const PlayerHistoryStatsFileSchema = z.record(
  z.string(),
  z.record(
    z.string(),
    z.object({
      passAccuracy: z.number().nullable(),
      keyPasses: z.number().int().nullable(),
      tackles: z.number().int().nullable(),
      interceptions: z.number().int().nullable(),
      duelsWon: z.number().int().nullable(),
      dribblesCompleted: z.number().int().nullable(),
      shotsOnTarget: z.number().int().nullable(),
      extended: ExtendedMetricsSchema,
    }),
  ),
);

// TASK-M68: market-value side-maps, built from Transfermarkt by the external
// pipeline. Two files, split by access pattern — see
// docs/superpowers/specs/2026-07-27-market-value-design.md §3.

/**
 * `data/market-values.json` — season → our player id → the LAST valuation of
 * that season. Clipped at apply time to seasons the app actually holds a row
 * for, which keeps it ~624 KB: it is read from request-time paths.
 */
export const MarketValueFileSchema = z.record(
  z.string(),
  z.record(
    z.string(),
    z.object({
      valueEur: z.number().int(),
      determined: z.string(),
    }),
  ),
);
export type MarketValueFile = z.infer<typeof MarketValueFileSchema>;

/**
 * `data/market-value-history.json` — our player id → every valuation of their
 * WHOLE career (including non-PL clubs and seasons), oldest first. ~5 MB, so
 * it must only ever be read from the ISR'd `/players/[id]` render.
 */
export const MarketValueHistoryFileSchema = z.record(
  z.string(),
  z.array(
    z.object({
      season: z.number().int(),
      valueEur: z.number().int(),
      determined: z.string(),
    }),
  ),
);
export type MarketValueHistoryFile = z.infer<typeof MarketValueHistoryFileSchema>;

// Player birth date + nationality, keyed by stable player id.
export const PlayerBioFileSchema = z.record(
  z.string(),
  z.object({
    birthDate: z.string().nullable(),
    nationality: z.string().nullable(),
    nationalityCode: z.string().nullable(),
  }),
);

// Player date of death, keyed by stable player id (deceased players only).
export const PlayerDeathsFileSchema = z.record(z.string(), z.string());

// Manual bio corrections that win over the auto bio (name/DOB/nationality/DOD).
export const PlayerBioOverridesFileSchema = z.record(
  z.string(),
  z.object({
    name: z.string().optional(),
    birthDate: z.string().optional(),
    nationality: z.string().optional(),
    nationalityCode: z.string().optional(),
    dateOfDeath: z.string().optional(),
  }),
);

// Short display-name overrides, keyed by stable player id.
export const PlayerNamesFileSchema = z.record(z.string(), z.string());

// === TASK-M26: committed per-player goal-attribution map ==================
// Built offline by `pnpm sync:data:goal-attribution` from events-*/fixtures-*.
// `players[id].opponents` = teamId -> goals scored against that club (career);
// `teams` = teamId -> club name (for opponent labels). hatTricks/multiGoalGames
// are precomputed per-(player,fixture) goal-count rollups.
export const GoalAttributionPlayerSchema = z.object({
  opponents: z.record(z.string(), z.number().int().nonnegative()),
  hatTricks: z.number().int().nonnegative(),
  multiGoalGames: z.number().int().nonnegative(),
});

export const GoalAttributionSchema = z.object({
  teams: z.record(z.string(), z.string()),
  players: z.record(z.string(), GoalAttributionPlayerSchema),
});

export type GoalAttribution = z.infer<typeof GoalAttributionSchema>;
export type GoalAttributionPlayer = z.infer<typeof GoalAttributionPlayerSchema>;

// TASK-M41: committed `captains.json` — season (string) → our teamId (string) →
// the stable player id of that team's most-frequent captain that season,
// derived from the lineup armband data (SDP `isCaptain` / legacy `captain`).
export const CaptainsFileSchema = z.record(
  z.string(),
  z.record(z.string(), z.number().int().positive()),
);

/**
 * managers.json (TASK-M48): season → our teamId → the managers who took charge
 * that season (most matches first), each with the PL person id (= a PL-CDN photo
 * code) + display name + match count.
 */
export const ManagersFileSchema = z.record(
  z.string(),
  z.record(
    z.string(),
    z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        matches: z.number().int().positive(),
        win: z.number().int().nonnegative(),
        draw: z.number().int().nonnegative(),
        loss: z.number().int().nonnegative(),
        gf: z.number().int().nonnegative(),
        ga: z.number().int().nonnegative(),
      }),
    ),
  ),
);

/** manager-bio.json (TASK-M48): normalized-name key → DOB + (optional) date of death. */
export const ManagerBioFileSchema = z.record(
  z.string(),
  z.object({
    birthDate: z.string().nullable(),
    dateOfDeath: z.string().nullable(),
    nationality: z.string().nullable().optional(),
    nationalityCode: z.string().nullable().optional(),
    photo: z.string().nullable().optional(),
  }),
);

/**
 * team-colors.json (TASK-M47): our teamId (string key) → the club's home + away
 * kit colors (hex), used to paint the lineup pitch dots. Curated/committed.
 */
export const TeamColorsFileSchema = z.record(
  z.string(),
  z.object({
    home: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    away: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
);

/**
 * club-logos.json (TASK-M54): our teamId (string key) → the club's HISTORICAL
 * crest variants, each `{ since, until, file }` (PL season start-years,
 * inclusive). The current crest is implicit (`public/logos/<teamId>.png`) — any
 * season past the last range, or a club not in this file, uses it. `file` is a
 * filename under `public/logos/history/`.
 */
export const ClubLogosFileSchema = z.record(
  z.string(),
  z.array(
    z.object({
      since: z.number().int(),
      until: z.number().int(),
      file: z.string().min(1),
    }),
  ),
);

/**
 * club-metadata.json (TASK-M19/M62/M64): our teamId (string key) → club identity
 * facts (city + stadium image + official website). All fields are nullable — a
 * club the pipeline can't resolve a field for renders it gracefully.
 */
export const ClubMetadataFileSchema = z.record(
  z.string(),
  z.object({
    city: z.string().nullable(),
    stadiumImage: z.string().nullable(),
    website: z.string().nullable(),
  }),
);

// Convenience array schemas for the output files
export const StandingsFileSchema = z.array(StandingSchema);
export const TeamsFileSchema = z.array(TeamSchema);
export const FixturesFileSchema = z.array(FixtureSchema);
export const PlayersFileSchema = z.array(PlayerSchema);

// TASK-M16: per-fixture attendance + venue. A committed sidecar map
// (data/fixture-extras-<season>.json) keyed by OUR fixture id, joined
// read-time in getFixtureDetail (like captains.json / managers.json). Both
// fields nullable: a match with no attendance keeps venue; a join miss → omitted.
export const FixtureExtrasFileSchema = z.record(
  z.string(),
  z.object({
    attendance: z.number().int().nullable(),
    venue: z.string().nullable(),
  }),
);

export type Meta = z.infer<typeof MetaSchema>;
export type RowCounts = z.infer<typeof RowCountsSchema>;
export type Standing = z.infer<typeof StandingSchema>;
export type Team = z.infer<typeof TeamSchema>;
export type Fixture = z.infer<typeof FixtureSchema>;
export type Player = z.infer<typeof PlayerSchema>;
export type PlayerSeasonSplit = z.infer<typeof PlayerSeasonSplitSchema>;
export type ComparisonMetrics = z.infer<typeof ComparisonMetricsSchema>;
export type ExtendedMetrics = z.infer<typeof ExtendedMetricsSchema>;
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
export type Leaderboards = z.infer<typeof LeaderboardsSchema>;
export type FixtureExtrasFile = z.infer<typeof FixtureExtrasFileSchema>;
export type FixtureLineups = z.infer<typeof FixtureLineupsSchema>;
export type TeamLineupRaw = z.infer<typeof TeamLineupRawSchema>;
export type LineupPlayerRaw = z.infer<typeof LineupPlayerRawSchema>;
export type MatchEventRaw = z.infer<typeof MatchEventRawSchema>;
export type LineupsFile = z.infer<typeof LineupsFileSchema>;
export type EventsFile = z.infer<typeof EventsFileSchema>;
export type SearchIndex = z.infer<typeof SearchIndexSchema>;
export type PlayerBioFile = z.infer<typeof PlayerBioFileSchema>;
export type PlayerDeathsFile = z.infer<typeof PlayerDeathsFileSchema>;
export type PlayerBioOverridesFile = z.infer<typeof PlayerBioOverridesFileSchema>;
export type PlayerNamesFile = z.infer<typeof PlayerNamesFileSchema>;
export type CaptainsFile = z.infer<typeof CaptainsFileSchema>;
export type PlayerXgFile = z.infer<typeof PlayerXgFileSchema>;
export type GkStatsFile = z.infer<typeof GkStatsFileSchema>;
export type ClubMetadataFile = z.infer<typeof ClubMetadataFileSchema>;
export type TeamColorsFile = z.infer<typeof TeamColorsFileSchema>;
export type ClubLogosFile = z.infer<typeof ClubLogosFileSchema>;
export type ManagersFile = z.infer<typeof ManagersFileSchema>;
export type ManagerBioFile = z.infer<typeof ManagerBioFileSchema>;
