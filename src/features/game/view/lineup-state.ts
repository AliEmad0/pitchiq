import type { Side } from "@/features/game/domain/match-types";
import type { PitchPlayer, ViewEvent, ViewSideTeam } from "./match-view-model";

/**
 * The lineup AS IT STANDS at a given minute.
 *
 * Before this, the pitch and the roster both rendered the starting eleven for the whole
 * match: a player sent off in the 20th kept running around, a substitute never appeared,
 * and a hat-trick looked exactly like being anonymous. The engine knew all of it — the
 * view simply never asked.
 *
 * Derived rather than stored, so it is correct at every minute of playback including
 * when the viewer scrubs backwards, and so there is exactly ONE definition of "who is on
 * the pitch" for both the mini-map and the roster list to share.
 */

export interface PlayerBadges {
  goals: number;
  assists: number;
  yellow: boolean;
  red: boolean;
  /** Came on as substitute number N (1-based, per side). */
  subOn?: number;
  /** Went off in substitution number N. */
  subOff?: number;
}

export interface RosterRow {
  player: PitchPlayer;
  badges: PlayerBadges;
  /** False once dismissed or substituted — the row stays, greyed. */
  onPitch: boolean;
}

export interface LineupState {
  /**
   * By formation slot. `null` where a player has been sent off and nobody replaced him,
   * which is exactly what the pitch should draw: a gap.
   */
  slots: (PitchPlayer | null)[];
  badges: Map<number, PlayerBadges>;
  /** Starters in formation order, then substitutes in the order they came on. */
  roster: RosterRow[];
}

const blank = (): PlayerBadges => ({ goals: 0, assists: 0, yellow: false, red: false });

export function lineupAt(
  team: ViewSideTeam,
  events: ViewEvent[],
  side: Side,
  minute: number,
): LineupState {
  const slots: (PitchPlayer | null)[] = [...team.players];
  const badges = new Map<number, PlayerBadges>();
  const cameOn: PitchPlayer[] = [];
  const gone = new Set<number>();
  let subCount = 0;

  const badgeFor = (id: number): PlayerBadges => {
    const existing = badges.get(id);
    if (existing) return existing;
    const fresh = blank();
    badges.set(id, fresh);
    return fresh;
  };

  for (const e of events) {
    if (e.minute > minute) break;
    if (e.side !== side) {
      // An own goal is credited to the OTHER side, so the scorer's badge belongs here.
      continue;
    }

    if (e.kind === "goal") {
      // A goal counts on the scorer's tally until the review takes it away — the same
      // rule the scoreboard uses, so the badge and the scoreline never disagree.
      // Without this a chalked-off goal stayed on the player's record for good.
      const stillCounts = e.disallowedAt == null || e.disallowedAt > minute;
      if (!stillCounts) continue;
      if (e.playerId != null) badgeFor(e.playerId).goals += 1;
      if (e.assistPlayerId != null) badgeFor(e.assistPlayerId).assists += 1;
      continue;
    }

    if (e.kind === "card" && e.playerId != null) {
      const b = badgeFor(e.playerId);
      if (e.card === "red") {
        b.red = true;
        gone.add(e.playerId);
        const i = slots.findIndex((s) => s?.playerId === e.playerId);
        if (i >= 0) slots[i] = null;
      } else {
        b.yellow = true;
      }
      continue;
    }

    if (e.kind === "substitution" && e.playerId != null && e.subOnPlayerId != null) {
      subCount += 1;
      badgeFor(e.playerId).subOff = subCount;
      badgeFor(e.subOnPlayerId).subOn = subCount;
      gone.add(e.playerId);
      const replacement =
        team.bench.find((b) => b.playerId === e.subOnPlayerId) ??
        ({
          playerId: e.subOnPlayerId,
          row: 0,
          col: 0,
          role: "CM",
          name: e.subOnName ?? "",
          number: 0,
          rating: null,
        } as PitchPlayer);
      const i = slots.findIndex((s) => s?.playerId === e.playerId);
      // Slot-preserving on purpose: the substitute takes the shape the departing player
      // held, so the formation does not visibly rearrange itself mid-match.
      if (i >= 0) slots[i] = replacement;
      cameOn.push(replacement);
    }
  }

  const roster: RosterRow[] = [
    ...team.players.map((p) => ({
      player: p,
      badges: badges.get(p.playerId) ?? blank(),
      onPitch: !gone.has(p.playerId),
    })),
    ...cameOn.map((p) => ({
      player: p,
      badges: badges.get(p.playerId) ?? blank(),
      onPitch: !gone.has(p.playerId),
    })),
  ];

  return { slots, badges, roster };
}
