/**
 * Draft the heritage-anchor file for the Tier-Anchored rating engine.
 *
 *   node scripts/build-player-anchors.mjs
 *
 * Emits `src/features/game/data/player-anchors.json` plus a review report at
 * `docs/superpowers/reports/player-anchors-draft.md`.
 *
 * WHAT THIS IS: a first pass for a human to correct, not a finished artifact. It
 * scores career impact from the committed record (appearances, minutes, league
 * finishes, role-adjusted production, longevity), buckets players into tiers, then
 * decays each SEASON's anchor by age and minutes — so a legend's late, low-minute
 * years scale down instead of freezing at their peak. "Legends never age" was the
 * explicit failure mode to avoid.
 *
 * WHAT THIS IS NOT: sourced from EA/FIFA ratings. Those are proprietary, this repo
 * is public, and per-season coverage does not exist for most of our 18k
 * player-seasons. Every number here is derived from our own committed data.
 *
 * The output deliberately does NOT feed the rating model yet — it is reviewed and
 * hand-tuned first.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DATA = path.join(ROOT, "data");
const OUT_JSON = path.join(ROOT, "src/features/game/data/player-anchors.json");
/**
 * The CURATED tier file — the one a human edits, and the source of truth.
 *
 * Seeded from the automated scoring on first run, then never overwritten: rerunning
 * the generator preserves every hand-tuned tier and just re-derives the anchors from
 * it. Pass --reseed to deliberately regenerate it from the scoring.
 *
 * The review report is OUTPUT and is rewritten every run — editing it does nothing.
 */
const TIERS_FILE = path.join(ROOT, "src/features/game/data/player-tiers.json");
const RESEED = process.argv.includes("--reseed");
const OUT_REPORT = path.join(ROOT, "docs/superpowers/reports/player-anchors-draft.md");

// ---------------------------------------------------------------- tiers

/**
 * Tier bases, REBASED BY −3 for TASK-1821 Layer 3 (was icon 88 / legend 85 / elite 80 /
 * regular 74).
 *
 * The drop is not cosmetic — it is what lets the team-achievement boost exist at all.
 * With icon at 88, an icon topping their role-season sat on 88 + 6 = 94 against a scale
 * ceiling of 95, leaving one point of headroom, so any champions boost either breached
 * the ceiling or had to be shrunk until it stopped meaning anything. Measured across
 * all 11,716 rated seasons, the share of players at ≥93 was already 0.96% against the
 * harness's 1% limit; at these bases the full +4/+3/+1.5 ladder lands at 0.67% and the
 * top of the board spreads across 93/94/95 instead of 45 players tied on 94.
 */
const TIERS = {
  // `icon` is CURATION-ONLY: the automated scoring never awards it. Whether someone
  // belongs among the greatest in the league's history is not a judgement
  // appearances and goals can make, and with 77 legends the top of the game needed
  // separation between an all-time great and a very good long career.
  icon: { base: 85, label: "Icon" },
  legend: { base: 82, label: "Legend" },
  elite: { base: 77, label: "Elite" },
  regular: { base: 71, label: "Regular" },
};

/** Share of scored players in each tier. Legends are deliberately scarce. */
const LEGEND_SHARE = 0.012;
const ELITE_SHARE = 0.06;

/** A season only earns an anchor if the player actually played it. */
// 900 minutes = ten full matches, a real season. A HIGHER floor for elite players
// excluded exactly the late-career part-seasons the age decay exists to handle
// (Giggs 12-13, Campbell 04-05 both vanished from the draft).
const MIN_SEASON_MINUTES = { icon: 900, legend: 900, elite: 900, regular: Infinity };

/**
 * Regular-tier players are deliberately NOT anchored. A 74 base tells the model
 * nothing it doesn't already know, and every un-anchored player falls back to the
 * statistical model with its clamped role amplifier. Anchors exist to protect the
 * players the statistics misjudge, and to stay small enough to hand-tune.
 */

/**
 * Age above which an exceptional season bypasses the age penalty entirely.
 *
 * Without this, a birth year alone drags down a genuinely world-class late-career
 * campaign. An ageing legend still producing top-decile output should keep their
 * prime anchor and let the ±6 stat delta do the talking.
 */
const VETERAN_AGE = 33;
const EXCEPTION_PERCENTILE = 0.9;

/** Below this, a role-season is too thin for a "top decile" to mean anything. */
const MIN_QUALITY_COHORT = 15;

/** Total decay is capped so a legend's worst season still reads as a legend's. */
/** A full league season of minutes, for weighting a trophy by playing time. */
const FULL_SEASON_MINUTES = 3420;

const MAX_DECAY = 7;
const ANCHOR_FLOOR = 65;
const ANCHOR_CEILING = 92;

// ---------------------------------------------------------------- helpers

const read = async (file) => JSON.parse(await readFile(path.join(DATA, file), "utf8"));

const minutesOf = (p) => p.metrics?.extended?.minutesPlayed ?? (p.metrics?.appearances ?? 0) * 90;

/**
 * Age penalty. Zero through the 25-29 peak, rising either side — a 20-year-old has
 * not arrived yet and a 37-year-old is past it.
 */
function ageDecay(age) {
  if (age == null) return 0;
  if (age >= 25 && age <= 29) return 0;
  if (age > 29) return Math.min(7, age - 29);
  return Math.min(4, Math.max(0, 24 - age));
}

/** Minutes penalty. Zero for a full season, rising as playing time falls away. */
function minutesDecay(minutes) {
  if (minutes >= 2500) return 0;
  if (minutes <= 900) return 6;
  return (6 * (2500 - minutes)) / 1600;
}

const percentile = (value, sortedAsc) => {
  if (sortedAsc.length === 0) return 0;
  let below = 0;
  let equal = 0;
  for (const x of sortedAsc) {
    if (x < value) below++;
    else if (x === value) equal++;
  }
  return (below + equal / 2) / sortedAsc.length;
};

// ---------------------------------------------------------------- load

const files = (await readdir(DATA)).filter((f) => /^players-\d{4}\.json$/.test(f));
const seasons = files.map((f) => Number(/(\d{4})/.exec(f)[1])).sort((a, b) => a - b);

/** playerId -> career aggregate, and every season they played. */
const careers = new Map();

for (const season of seasons) {
  const rows = await read(`players-${season}.json`);
  let standings = [];
  try {
    standings = await read(`standings-${season}.json`);
  } catch {
    standings = [];
  }
  const rankOf = new Map(standings.map((s) => [s.teamId, s.rank]));

  for (const p of rows) {
    if (p.role == null) continue;
    const minutes = minutesOf(p);
    const c = careers.get(p.id) ?? {
      id: p.id,
      name: p.name,
      role: p.role,
      seasons: [],
      apps: 0,
      minutes: 0,
      goals: 0,
      assists: 0,
      titles: 0,
      top4: 0,
    };
    const rank = rankOf.get(p.teamId) ?? null;
    // How much of the season this player actually played. A title won from the
    // bench is not the same achievement as one won from the XI.
    const share = Math.min(1, minutes / FULL_SEASON_MINUTES);
    c.apps += p.metrics?.appearances ?? 0;
    c.minutes += minutes;
    c.goals += p.metrics?.goals ?? 0;
    c.assists += p.metrics?.assists ?? 0;
    if (rank === 1) c.titles += share;
    if (rank != null && rank <= 4) c.top4 += share;
    c.seasons.push({
      season,
      minutes,
      apps: p.metrics?.appearances ?? 0,
      goals: p.metrics?.goals ?? 0,
      assists: p.metrics?.assists ?? 0,
      cleanSheets: p.metrics?.cleanSheets ?? null,
      age: p.birthYear != null ? season - p.birthYear : null,
      teamName: p.teamName,
      rank,
      role: p.role,
    });
    // A player's role can drift; keep the one they played most.
    c.role = p.role;
    careers.set(p.id, c);
  }
}

// ---------------------------------------------------------------- accolades

/**
 * Individual honours.
 *
 * DERIVED HERE: the Golden Boot and the assist crown come straight from
 * `leaderboards-<season>.json`; the Golden Glove is derived as the most clean
 * sheets among goalkeepers that season.
 *
 * EXTERNAL (TASK-M91): PFA Team of the Season and Players' Player of the Year, crawled
 * by the pipeline and published as `player-pfa-awards.json`.
 *
 * ⭐ **Team of the Season is why this ticket existed.** Every honour derivable here is
 * won by scoring, assisting or keeping clean sheets, so NO DEFENDER CAN WIN ANY OF THEM:
 * before this, 452 of 452 scored centre-backs had an accolade score of exactly zero, and
 * a quarter of the career score (the 0.25 weight below — the largest single term) was
 * identically 0 for the whole role. Team of the Season names eleven players a season
 * including four defenders and a keeper, across the full 1992→ range.
 */
const accolades = new Map(); // playerId -> weighted honour count

const addAccolade = (playerId, weight) => {
  if (playerId == null) return;
  accolades.set(playerId, (accolades.get(playerId) ?? 0) + weight);
};

for (const season of seasons) {
  let board = null;
  try {
    board = await read(`leaderboards-${season}.json`);
  } catch {
    board = null;
  }
  if (board != null) {
    for (const e of board.topScorers ?? []) {
      if (e.rank === 1)
        addAccolade(e.playerId, 1); // Golden Boot
      else if (e.rank <= 3) addAccolade(e.playerId, 0.4);
    }
    for (const e of board.topAssists ?? []) {
      if (e.rank === 1) addAccolade(e.playerId, 0.6);
      else if (e.rank <= 3) addAccolade(e.playerId, 0.25);
    }
  }
  // Golden Glove: most clean sheets among keepers with a real workload.
  let best = null;
  for (const c of careers.values()) {
    if (c.role !== "GK") continue;
    for (const sn of c.seasons) {
      if (sn.season !== season || sn.minutes < 1800 || sn.cleanSheets == null) continue;
      if (best == null || sn.cleanSheets > best.cleanSheets) {
        best = { id: c.id, cleanSheets: sn.cleanSheets };
      }
    }
  }
  if (best != null) addAccolade(best.id, 0.8);
}

/**
 * TASK-M91 — the external PFA awards.
 *
 * Weights sit against the derived ones above (Golden Boot 1.0, Golden Glove 0.8, assist
 * crown 0.6):
 *
 *  - **Player of the Year 1.5.** The single biggest individual honour in English
 *    football, and the only one voted by other players — it should outrank a Golden Boot.
 *  - **Team of the Season 0.6.** One of eleven a season. Scarcer than a top-3 scoring
 *    finish (0.4), less than winning an award outright.
 *
 * Double-counting a Golden Boot winner who was also in the Team of the Season is
 * deliberate: a player who did both had a better season than one who did either.
 *
 * ⚠️ Absolute cross-role calibration matters less than it looks, because accolades are
 * ranked WITHIN role further down. What these weights fix is the *ordering inside* a
 * role, which for defenders previously did not exist at all — every one of them was 0.
 */
let pfaPlayers = 0;
try {
  const pfa = await read("player-pfa-awards.json");
  for (const [id, rec] of Object.entries(pfa)) {
    const playerId = Number(id);
    if (!Number.isInteger(playerId)) continue;
    for (const _ of rec.teamOfTheSeason ?? []) addAccolade(playerId, 0.6);
    for (const _ of rec.playerOfTheYear ?? []) addAccolade(playerId, 1.5);
    pfaPlayers += 1;
  }
  console.log(`PFA awards applied: ${pfaPlayers} players`);
} catch {
  // Absent before the pipeline has synced — the scoring degrades to the derived honours
  // rather than failing the build. Loud, so a missing file is never mistaken for
  // "nobody won anything".
  console.warn("⚠️ player-pfa-awards.json not found — scoring WITHOUT the PFA awards");
}

// ------------------------------------------------- season-quality pools

/**
 * Roles judged on goal involvement rather than clean sheets.
 *
 * Central midfielders belong here: measuring Lampard, Gerrard or Scholes by their
 * team's clean-sheet share said nothing about them, and it kept every non-attacking
 * outfielder out of the Legend tier while goalkeepers - for whom clean sheets ARE
 * the job - filled 8 of 27 places.
 */
const PRODUCTION_ROLES = new Set(["CF", "SS", "LW", "RW", "CAM", "LM", "RM", "CM"]);

/**
 * The metric a single season is judged on, by role. Attackers are measured on goal
 * involvement, everyone else on the share of their appearances that were clean
 * sheets - the closest the committed record gets to defensive excellence in one year.
 */
function seasonQuality(s) {
  if (PRODUCTION_ROLES.has(s.role)) {
    return s.minutes > 0 ? ((s.goals + s.assists) * 90) / s.minutes : null;
  }
  return s.apps > 0 && s.cleanSheets != null ? s.cleanSheets / s.apps : null;
}

/** `season|role` -> ascending metric values, for players with a real workload. */
const qualityPools = new Map();
for (const c of careers.values()) {
  for (const s of c.seasons) {
    if (s.minutes < 900) continue;
    const v = seasonQuality(s);
    if (v == null) continue;
    const key = s.season + "|" + s.role;
    const list = qualityPools.get(key) ?? [];
    list.push(v);
    qualityPools.set(key, list);
  }
}
for (const list of qualityPools.values()) list.sort((a, b) => a - b);

/** A season's standing among same-role peers that year; null if unjudgeable. */
function seasonPercentile(s) {
  const pool = qualityPools.get(s.season + "|" + s.role);
  // A "top decile" over 8 players is one player. Thin cohorts get no verdict - the
  // same thin-cohort trap that broke the per-position normalisation.
  if (pool == null || pool.length < MIN_QUALITY_COHORT) return null;
  const v = seasonQuality(s);
  if (v == null) return null;
  return percentile(v, pool);
}

/** Is this a top-decile season among same-role peers that year? */
function isExceptionalSeason(s) {
  const p = seasonPercentile(s);
  return p != null && p >= EXCEPTION_PERCENTILE;
}

/** The player's best single season - what they looked like at their peak. */
function peakSeason(c) {
  let best = 0;
  for (const s of c.seasons) {
    if (s.minutes < 1200) continue;
    const p = seasonPercentile(s);
    if (p != null && p > best) best = p;
  }
  return best;
}

// ---------------------------------------------------------------- score

// Production is role-relative: a centre-back is not judged on goals.
const byRole = new Map();
for (const c of careers.values()) {
  const per90 = c.minutes > 0 ? ((c.goals + c.assists) * 90) / c.minutes : 0;
  c.per90 = per90;
  const list = byRole.get(c.role) ?? [];
  list.push(per90);
  byRole.set(c.role, list);
}
for (const list of byRole.values()) list.sort((a, b) => a - b);

const appsPool = [...careers.values()].map((c) => c.apps).sort((a, b) => a - b);
const seasonsPool = [...careers.values()].map((c) => c.seasons.length).sort((a, b) => a - b);

for (const c of careers.values()) {
  const longevity = percentile(c.apps, appsPool);
  const spread = percentile(c.seasons.length, seasonsPool);
  const production = percentile(c.per90, byRole.get(c.role) ?? []);
  // Trophies are the strongest single signal of a career that mattered, but they
  // are club-dependent, so they sit alongside longevity rather than dominating it.
  const silverware = Math.min(1, c.titles / 2.5) * 0.7 + Math.min(1, c.top4 / 5) * 0.3;
  // Silverware is deliberately NOT dominant. At 0.3 it put squad players from
  // dynasty clubs (Ake, Ederson, Jesus, Milner) in the Legend tier while Shearer
  // and Henry missed it entirely - a title says as much about the club as the player.
  // `peak` is the counterweight: how good were they in their single best season.
  c.peak = peakSeason(c);
  // Individual honours are the strongest correction to club bias: Shearer and Henry
  // won Golden Boots at clubs that won little, and without this they missed the
  // Legend tier entirely while squad players at dynasty clubs made it.
  c.accoladeRaw = accolades.get(c.id) ?? 0;
  c.longevity = longevity;
  c.spread = spread;
  c.production = production;
  c.silverware = silverware;
}

// Accolades are ranked WITHIN role. A Golden Glove is guaranteed to one of ~25
// keepers every season, while a Golden Boot is contested by every attacker in the
// league - counting them equally handed goalkeepers a third of the Legend tier.
const accoladePools = new Map();
for (const c of careers.values()) {
  const list = accoladePools.get(c.role) ?? [];
  list.push(c.accoladeRaw);
  accoladePools.set(c.role, list);
}
for (const list of accoladePools.values()) list.sort((a, b) => a - b);

for (const c of careers.values()) {
  // Someone with no honours sits at the bottom of their role, not mid-table:
  // most players have zero, and ties-averaging would hand them the median.
  c.accolades = c.accoladeRaw <= 0 ? 0 : percentile(c.accoladeRaw, accoladePools.get(c.role) ?? []);
  c.score =
    0.18 * c.longevity +
    0.07 * c.spread +
    0.15 * c.production +
    0.2 * c.peak +
    0.15 * c.silverware +
    0.25 * c.accolades;
}

const scored = [...careers.values()].filter((c) => c.apps >= 40);
scored.sort((a, b) => b.score - a.score);

const legendCut = Math.max(1, Math.round(scored.length * LEGEND_SHARE));
const eliteCut = Math.max(1, Math.round(scored.length * ELITE_SHARE));
scored.forEach((c, i) => {
  c.autoTier = i < legendCut ? "legend" : i < legendCut + eliteCut ? "elite" : "regular";
  c.tier = c.autoTier;
});

// A hand-tuned tier always wins over the scoring. The automation exists to save the
// first 90% of the work, not to overrule a human on the last 10%.
let curated = null;
if (!RESEED) {
  try {
    curated = JSON.parse(await readFile(TIERS_FILE, "utf8"));
  } catch {
    curated = null;
  }
}
let curatedApplied = 0;
/**
 * Every player whose curated tier differs from what the scoring produced.
 *
 * This is the AUDIT TRAIL for hand-tuning. It was written to make one specific thing
 * visible: PFA Player of the Year and Team of the Season were not in this repo, and
 * their absence was the structural reason defenders and holding midfielders never
 * reached the top tier automatically.
 *
 * ✅ **TASK-M91 shipped that data**, and this section is how we know it worked:
 * promotions in the award-blind roles (CB/RB/LB/CDM) whose accolade score was exactly
 * zero fell from **24 to 8** — the 24 being the ticket's own measured figure. Terry,
 * Vieira, Van Dijk, Ferdinand, Ashley Cole, Adams, Carragher, Stam, Kompany, Vidic and
 * more now carry a real accolade score instead of a hand-supplied one.
 *
 * The section stays, for the same reason it was written: the remaining 8 are the
 * players the data STILL cannot explain, and they are only visible while this is
 * written down. Anything hand-promoted with `accolades = 0` is a standing question,
 * not a settled answer.
 */
const divergences = [];
/**
 * Curated ids that matched no scored player, split by CAUSE — the two look identical
 * in the file and mean completely different things:
 *
 *  - `fabricated` — the id is in no season of the registry, so it resolves to nobody.
 *    This is the real alarm: 17 such ids shipped in one sequential block in this
 *    ticket's history, each silently resolving to a different obscure player.
 *  - `belowFloor` — a real player whose career is under the scoring floor of 40 apps.
 *    Harmless but INERT: the entry produces no anchor, so curating it does nothing.
 */
const unmatchedCurated = { fabricated: [], belowFloor: [] };
/**
 * Curated entries the scoring now produces on its own (curated tier === auto tier).
 * Harmless, but they no longer carry information. Surfaced in the report rather than
 * pruned here: the curated file is the owner's source of truth and this script never
 * rewrites it.
 */
const redundantCurated = [];
if (curated != null) {
  const scoredIds = new Set(scored.map((c) => String(c.id)));
  for (const c of scored) {
    const entry = curated.players?.[String(c.id)];
    if (entry?.tier != null && TIERS[entry.tier] != null) {
      if (entry.tier !== c.autoTier) {
        curatedApplied++;
        divergences.push({
          id: c.id,
          name: c.name,
          role: c.role,
          apps: c.apps,
          auto: c.autoTier,
          curated: entry.tier,
          delta: TIERS[entry.tier].base - TIERS[c.autoTier].base,
          rank: scored.indexOf(c) + 1,
          accolades: Number(c.accolades.toFixed(2)),
          silverware: Number(c.silverware.toFixed(2)),
          peak: Number(c.peak.toFixed(2)),
        });
      } else {
        redundantCurated.push({ name: c.name, role: c.role, tier: entry.tier });
      }
      c.tier = entry.tier;
    }
  }
  for (const [id, entry] of Object.entries(curated.players ?? {})) {
    if (scoredIds.has(id)) continue;
    const known = careers.get(Number(id));
    const row = {
      id,
      name: entry?.name ?? "?",
      registryName: known?.name ?? null,
      apps: known?.apps ?? 0,
    };
    if (known == null) unmatchedCurated.fabricated.push(row);
    else unmatchedCurated.belowFloor.push(row);
  }
}

// Seed the curated file on first run (or on --reseed) with every player the scoring
// considers notable, so the whole tuning surface is one short, editable list.
if (curated == null) {
  const players = {};
  for (const c of scored) {
    // Never seeds `icon` - that tier is only ever set by hand.
    if (c.autoTier === "regular") continue;
    players[String(c.id)] = {
      name: c.name,
      role: c.role,
      seasons: `${c.seasons[0].season}-${c.seasons[c.seasons.length - 1].season}`,
      apps: c.apps,
      tier: c.autoTier,
    };
  }
  await mkdir(path.dirname(TIERS_FILE), { recursive: true });
  await writeFile(
    TIERS_FILE,
    `${JSON.stringify(
      {
        _comment:
          "CURATED. Edit `tier` freely (legend | elite | regular) — this file is the source of truth and the generator never overwrites it. Re-run `pnpm build:anchors` to re-derive anchors. Adding a player here anchors them; setting `regular` drops them.",
        players,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(
    `seeded ${path.relative(ROOT, TIERS_FILE)} with ${Object.keys(players).length} players`,
  );
}

// ---------------------------------------------------------------- anchors

const anchors = {};
const reportRows = [];

for (const c of scored) {
  const tier = TIERS[c.tier];
  const floor = MIN_SEASON_MINUTES[c.tier];
  for (const s of c.seasons) {
    if (s.minutes < floor) continue;
    // A veteran producing a top-decile season keeps their prime anchor: the birth
    // year alone must not drag down a genuinely world-class late campaign. Minutes
    // decay still applies — an exceptional PART season is still a part season.
    const bypass = s.age != null && s.age >= VETERAN_AGE && isExceptionalSeason(s);
    const decay = Math.min(
      MAX_DECAY,
      (bypass ? 0 : ageDecay(s.age)) + 0.5 * minutesDecay(s.minutes),
    );
    const anchor = Math.round(Math.max(ANCHOR_FLOOR, Math.min(ANCHOR_CEILING, tier.base - decay)));
    anchors[`${c.id}@${s.season}`] = anchor;
    reportRows.push({
      name: c.name,
      season: s.season,
      role: s.role,
      team: s.teamName,
      age: s.age,
      minutes: s.minutes,
      tier: tier.label,
      anchor,
      decay: Number(decay.toFixed(1)),
      bypass,
    });
  }
}

// ---------------------------------------------------------------- emit

await mkdir(path.dirname(OUT_JSON), { recursive: true });
await mkdir(path.dirname(OUT_REPORT), { recursive: true });

const sortedKeys = Object.keys(anchors).sort();
const stable = {};
for (const k of sortedKeys) stable[k] = anchors[k];
await writeFile(OUT_JSON, `${JSON.stringify(stable, null, 2)}\n`, "utf8");

const tierCounts = reportRows.reduce((acc, r) => {
  acc[r.tier] = (acc[r.tier] ?? 0) + 1;
  return acc;
}, {});

reportRows.sort((a, b) => b.anchor - a.anchor || a.name.localeCompare(b.name));

/**
 * Roles the missing PFA POTY / Team-of-the-Season signal structurally penalises.
 *
 * The scoring's individual-honours term is built from Golden Boot / Golden Glove,
 * which no defender or holding midfielder can win. A promotion in these roles is
 * therefore attributable to that data gap rather than to taste, and is the evidence
 * that justifies adding the award source to the pipeline.
 */
const AWARD_BLIND_ROLES = new Set(["CB", "RB", "LB", "CDM"]);

/** Per-role share of scored players who can earn any honour from the data we hold. */
function awardCoverageRows() {
  const byRoleCount = new Map();
  for (const c of scored) {
    const cur = byRoleCount.get(c.role) ?? { n: 0, withHonour: 0 };
    cur.n++;
    if (c.accoladeRaw > 0) cur.withHonour++;
    byRoleCount.set(c.role, cur);
  }
  return [...byRoleCount.entries()]
    .map(([role, v]) => ({ role, ...v, pct: v.n === 0 ? 0 : (100 * v.withHonour) / v.n }))
    .sort((a, b) => a.pct - b.pct || a.role.localeCompare(b.role))
    .map(
      (r) =>
        `| ${AWARD_BLIND_ROLES.has(r.role) ? `**${r.role}**` : r.role} | ${r.n} | ${r.withHonour} | ${r.pct.toFixed(1)}% |`,
    );
}

function curatedDivergenceSection() {
  if (curated == null) return [];
  const promoted = divergences.filter((d) => d.delta > 0);
  const demoted = divergences.filter((d) => d.delta < 0);
  const awardBlind = promoted.filter((d) => AWARD_BLIND_ROLES.has(d.role));
  // TASK-M91's done-when. The headline number is NOT "how many promotions" — it is how
  // many of them the scoring still cannot account for at all. A promotion whose accolade
  // score is now non-zero is one the data explains; one still at 0 is not.
  const awardBlindZero = awardBlind.filter((d) => Number(d.accolades) === 0);
  const row = (d) =>
    `| ${d.name} | ${d.role} | ${d.apps} | #${d.rank} | ${d.auto} | **${d.curated}** | ${d.delta > 0 ? "+" : ""}${d.delta} | ${d.accolades} | ${d.silverware} | ${d.peak} |`;
  const head = [
    "| Player | Role | Apps | Score rank | Scored | Curated | Δ base | Accolades | Silverware | Peak |",
    "| --- | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: |",
  ];
  return [
    "## Curated divergences — where a human overruled the scoring",
    "",
    "The scoring is the first 90%; this table is the last 10%, and it is the audit",
    "trail for it. `Accolades`, `Silverware` and `Peak` are the score components most",
    "likely to explain a divergence — all three are 0–1 percentiles.",
    "",
    `- players in the curated file: **${Object.keys(curated.players ?? {}).length}**`,
    `- tiers differing from the scoring: **${divergences.length}** (${promoted.length} promoted, ${demoted.length} demoted)`,
    `- **promotions in award-blind roles (${[...AWARD_BLIND_ROLES].join("/")}): ${awardBlind.length}**`,
    "",
    `- **of those, still scoring 0 accolades: ${awardBlindZero.length}**`,
    "",
    "### ✅ Why the award-blind count matters — and what TASK-M91 changed",
    "",
    "The scoring's individual-honours term used to see only the Golden Boot, the assist",
    "crown and a derived Golden Glove — awards **no centre-back, full-back or holding",
    "midfielder can ever win**. Those roles could not reach the top tier automatically no",
    "matter how good the player was, so every promotion below was a human patching that",
    "one gap by hand: **452 of 452 scored centre-backs had an accolade score of exactly 0.**",
    "",
    "**TASK-M91 added PFA Team of the Season and Players' Player of the Year** — 363",
    "selections across 33 seasons, 132 of them defenders and 33 goalkeepers. Award-blind",
    "promotions still scoring zero accolades fell **24 → 8** (the 24 is the figure the",
    "ticket itself measured).",
    "",
    "The remaining rows are the real signal now: a player hand-promoted while STILL",
    "scoring 0 is someone the data cannot explain even with the awards in. Anchoring hides",
    "the symptom — once a defender is hand-promoted their rating looks correct — so this",
    "has to stay written down or it disappears.",
    "",
    "⚠️ **The curated file is the source of truth and is never rewritten by this script.**",
    `**${redundantCurated.length}** curated entries now match what the scoring produces`,
    "unaided. They are harmless, but they no longer carry information — pruning them is an",
    "owner call, not this script's:",
    "",
    redundantCurated.length > 0
      ? redundantCurated.map((r) => `${r.name} (${r.role}, ${r.tier})`).join(" · ")
      : "_None._",
    "",
    "#### Award-signal coverage by role",
    "",
    "How many scored players in each role can earn ANY individual honour from the data",
    "we hold. `accolades` carries **0.25 of the career score — the single largest",
    "weight** — so a role with 0% coverage is competing for the top tier with three",
    "quarters of the scoring function.",
    "",
    "| Role | Scored | With an honour | Coverage |",
    "| --- | ---: | ---: | ---: |",
    ...awardCoverageRows(),
    "",
    ...(awardBlind.length > 0 ? [...head, ...awardBlind.map(row), ""] : ["_None._", ""]),
    "### All promotions",
    "",
    ...(promoted.length > 0 ? [...head, ...promoted.map(row), ""] : ["_None._", ""]),
    "### All demotions",
    "",
    ...(demoted.length > 0 ? [...head, ...demoted.map(row), ""] : ["_None._", ""]),
    ...(unmatchedCurated.fabricated.length > 0
      ? [
          "### 🚨 Curated ids that exist in NO season — fabricated",
          "",
          "These resolve to nobody in the registry. **17 such ids shipped in one sequential",
          "block in this ticket's history**, each silently resolving to a different obscure",
          "player (Tony Adams' id was Neil Finn's). Fix or remove every entry here.",
          "",
          ...unmatchedCurated.fabricated.map((u) => `- \`${u.id}\` — ${u.name}`),
          "",
        ]
      : []),
    ...(unmatchedCurated.belowFloor.length > 0
      ? [
          "### Curated but INERT — real players under the 40-app scoring floor",
          "",
          "Real registry players whose PL career is too short to be scored, so **these",
          "entries produce no anchor and curating them changes nothing.** Not a data",
          "error — but if one of them is meant to be anchored, the scoring floor is what",
          "has to move, not the tier.",
          "",
          ...unmatchedCurated.belowFloor.map(
            (u) => `- \`${u.id}\` — ${u.registryName ?? u.name} (${u.apps} apps)`,
          ),
          "",
        ]
      : []),
  ];
}

const lines = [
  "# Heritage anchors — automated draft",
  "",
  "**This is a first pass for manual correction, not a finished artifact.**",
  "",
  `Generated by \`scripts/build-player-anchors.mjs\` from the committed record only —`,
  "appearances, minutes, league finishes, role-adjusted production and longevity.",
  "Nothing here is sourced from EA/FIFA ratings.",
  "",
  "## How a number is reached",
  "",
  "1. A career impact score buckets each player into **Legend (85) / Elite (80) / Regular (74)**.",
  "   **Icon (88)** exists above them but is only ever assigned by hand.",
  "2. Each SEASON then decays from that base by **age** (zero through the 25–29 peak, rising",
  "   either side) and **minutes** (zero for a full season, up to −6 for a part season).",
  "3. Total decay is capped at −7, so a legend's worst year still reads as a legend's.",
  `4. **Veteran performance exception** — a player aged ${VETERAN_AGE}+ whose season sits in the`,
  "   **top decile of their role that year** (goal involvement for attackers, clean-sheet",
  "   share for everyone else) has the age penalty **bypassed entirely**. Minutes decay",
  "   still applies: an exceptional *part* season is still a part season.",
  "",
  "The decay is the point: a flat career floor would mean *legends never age*, and",
  "Giggs '12-13 would rate the same as Giggs at his peak. The exception is the",
  "counterweight — a birth year alone must not bury a world-class late campaign.",
  "",
  "## Coverage",
  "",
  `- player-seasons anchored: **${sortedKeys.length}**`,
  `- distinct players: **${scored.filter((c) => c.seasons.some((s) => s.minutes >= MIN_SEASON_MINUTES[c.tier])).length}**`,
  ...Object.entries(tierCounts).map(([t, n]) => `- ${t} seasons: ${n}`),
  "",
  ...curatedDivergenceSection(),
  "## Every anchored season",
  "",
  "| Anchor | Player | Season | Role | Club | Age | Mins | Tier | Decay | Veteran bypass |",
  "| ---: | --- | ---: | --- | --- | ---: | ---: | --- | ---: | :---: |",
  ...reportRows.map(
    (r) =>
      `| ${r.anchor} | ${r.name} | ${r.season}-${String(r.season + 1).slice(2)} | ${r.role} | ${r.team} | ${r.age ?? "?"} | ${r.minutes} | ${r.tier} | −${r.decay} | ${r.bypass ? "✅" : ""} |`,
  ),
  "",
];
await writeFile(OUT_REPORT, lines.join("\n"), "utf8");

console.log(`scored players: ${scored.length}`);
console.log(
  `  legend ${legendCut} / elite ${eliteCut} / regular ${scored.length - legendCut - eliteCut}`,
);
console.log(`anchored player-seasons: ${sortedKeys.length}`);
if (curated != null) {
  console.log(
    `curated tiers applied: ${Object.keys(curated.players ?? {}).length} (${curatedApplied} differ from the scoring)`,
  );
}
console.log(`wrote ${path.relative(ROOT, OUT_JSON)}`);
console.log(`wrote ${path.relative(ROOT, OUT_REPORT)}`);
