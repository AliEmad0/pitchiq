import type { GameTeam } from "./team";
import type { TeamPower } from "./match-types";
import { weightsFor } from "./rating-weights";

export function powerOf(team: GameTeam): TeamPower {
  const rated = team.players.filter((p) => p.ratings != null);
  if (rated.length === 0) return { attack: 0, defense: 0, aggression: 50 };

  let attNum = 0,
    attDen = 0,
    defNum = 0,
    defDen = 0,
    discSum = 0;
  for (const player of rated) {
    const w = weightsFor(player.role);
    const r = player.ratings!;
    const aw = w.attack + w.creation; // attacking role weight
    const dw = w.defense + w.physical; // defensive role weight
    attNum += aw * ((r.attack + r.creation) / 2);
    attDen += aw;
    defNum += dw * ((r.defense + r.physical) / 2);
    defDen += dw;
    discSum += r.discipline;
  }
  return {
    attack: Math.round(attDen > 0 ? attNum / attDen : 0),
    defense: Math.round(defDen > 0 ? defNum / defDen : 0),
    aggression: Math.round(100 - discSum / rated.length),
  };
}
