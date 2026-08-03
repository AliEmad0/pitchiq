import "server-only";
import { loadLineups } from "@/data/loaders";
import type { PlayerRole, TeamLineupRaw } from "@/data/schemas";
import {
  type Formation,
  type FormationSlot,
  formationKey,
  parseGrid,
} from "@/features/game/domain/formation";

/** Coarse lineup `pos` → a representative game role (refined later from M56 cards). */
const POS_TO_ROLE: Record<string, PlayerRole> = {
  Goalkeeper: "GK",
  Defender: "CB",
  Midfielder: "CM",
  Attacker: "CF",
};

function roleFromPos(pos: string | null): PlayerRole {
  return (pos && POS_TO_ROLE[pos]) || "CM";
}

/** One real team lineup → a Formation (starting XI only; bench excluded). */
export function formationFromLineup(
  lineup: TeamLineupRaw,
  season: number,
): Formation {
  const slots: FormationSlot[] = [];
  for (const p of lineup.startXI) {
    const pos = parseGrid(p.grid);
    if (!pos) continue; // bench / indeterminate grid
    slots.push({ row: pos.row, col: pos.col, role: roleFromPos(p.pos) });
  }
  return { name: lineup.formation ?? "", season, slots };
}

/** Group lineups by formationKey; keep the first representative of each. */
export function mineFormationTemplates(
  lineups: TeamLineupRaw[],
  season: number,
): Formation[] {
  const byKey = new Map<string, Formation>();
  for (const lineup of lineups) {
    const formation = formationFromLineup(lineup, season);
    if (formation.slots.length === 0) continue;
    const key = formationKey(formation);
    if (!byKey.has(key)) byKey.set(key, formation);
  }
  return [...byKey.values()];
}

/** Server-only: mine templates from every lineup in a season. */
export async function loadFormationTemplates(
  season: number,
): Promise<Formation[]> {
  const fixtures = await loadLineups(season);
  if (fixtures === null) return [];
  const teamLineups: TeamLineupRaw[] = [];
  for (const fx of Object.values(fixtures)) {
    if (fx.home) teamLineups.push(fx.home);
    if (fx.away) teamLineups.push(fx.away);
  }
  return mineFormationTemplates(teamLineups, season);
}
