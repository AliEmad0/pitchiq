import type { CommentaryRef } from "@/features/game/domain/commentary";
import type { ViewEvent, ViewSideTeam } from "./match-view-model";

/**
 * The moment a full-pitch banner announces.
 *
 * ⚠️ Lifted out of `MatchView` (owner, 2026-08-20) so the Legacy live screen can show the
 * same banners. It was fifty lines of derivation living inside a component's render, and a
 * second copy in `MatchLive` would have drifted the moment either screen gained a kind —
 * the two would then disagree about what counts as a big moment, which is exactly the sort
 * of difference nobody notices until a red card silently stops announcing itself on one
 * screen.
 */
export interface OverlayEvent {
  kind: "goal" | "card" | "penalty" | "var" | "injury" | "substitution";
  card?: "yellow" | "red";
  name: string;
  number: number;
  commentary: CommentaryRef;
}

/**
 * The banner for the event the clock has just reached, or undefined.
 *
 * ⛔ `event.minute` must equal `minute`. The banner is a *moment*, not a state: the caller
 * hands in the last event it has shown, and that event can be several minutes old once the
 * clock has moved on. Without this check the last goal of the match would stay pinned over
 * the pitch for the rest of it.
 *
 * ⛔ Minute 0 is excluded. Kick-off, the weather and the referee all land there, and a
 * banner over the opening whistle announces nothing.
 *
 * ⚠️ Only a RED card. A yellow is a routine event that the feed and the team sheet both
 * already carry; stopping the pitch for one would stop it a dozen times a match.
 */
export function overlayFor(
  event: ViewEvent | undefined,
  minute: number,
  teams: { home: ViewSideTeam; away: ViewSideTeam },
): OverlayEvent | undefined {
  if (!event || event.minute !== minute || event.minute === 0 || !event.side) return undefined;
  const team = event.side === "home" ? teams.home : teams.away;

  if (event.kind === "goal" && event.scorerSlot != null) {
    const pl = team.players[event.scorerSlot];
    if (pl) return { kind: "goal", name: pl.name, number: pl.number, commentary: event.commentary };
  }

  if (event.kind === "card" && event.card === "red" && event.bookedSlot != null) {
    const pl = team.players[event.bookedSlot];
    if (pl) {
      return {
        kind: "card",
        card: "red",
        name: pl.name,
        number: pl.number,
        commentary: event.commentary,
      };
    }
  }

  // A penalty, a VAR overturn and an injury all deserve the pitch to stop for them.
  if (event.kind === "penalty" || event.kind === "var" || event.kind === "injury") {
    const pl = event.scorerSlot != null ? team.players[event.scorerSlot] : undefined;
    return {
      kind: event.kind,
      // ⚠️ Falls back to the TEAM name rather than an empty string — several of these
      // kinds legitimately carry no player, and a banner with a blank line reads broken.
      name: pl?.name ?? team.name,
      number: pl?.number ?? 0,
      commentary: event.commentary,
    };
  }

  if (event.kind === "substitution" && event.offSlot != null) {
    const pl = team.players[event.offSlot];
    return {
      kind: "substitution",
      // The man coming ON is the news; his predecessor is the fallback.
      name: event.subOnName ?? pl?.name ?? team.name,
      number: pl?.number ?? 0,
      commentary: event.commentary,
    };
  }

  return undefined;
}
