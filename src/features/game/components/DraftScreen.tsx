"use client";
import { useTranslations } from "next-intl";
import { pickBack } from "@/features/game/domain/card-design";
import { displayName } from "@/features/game/domain/display-name";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import type { GameTeam } from "@/features/game/domain/team";
import { CardBack, PlayerCard } from "./PlayerCard";

interface Props {
  home: GameTeam;
  /** The auto-drafted rival — a full team with its own shape, straight from `chaosMatchup`. */
  opponent: GameTeam;
  exiting: boolean;
  reduced: boolean;
  onReroll: () => void;
  onPlay: () => void;
}

const avgOf = (team: GameTeam) => {
  const rs = team.players.map((p) => p.ratings?.overall).filter((r): r is number => r != null);
  return rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) / rs.length) : 0;
};

/**
 * TASK-1835 — "Match Night", the owner's pick from the 30-concept ritual (a hybrid he
 * specified over two refinement rounds).
 *
 * The versus board carries BOTH averages and BOTH shapes; the shared pitch shows the two
 * formations facing each other (yours attacking right); then the squads face each other
 * Mirror-Match style, every card dealt FACE-DOWN on its real back (`pickBack`'s seeded
 * K-design) and flipped over with a stagger — the suspense IS the reveal. Play spans
 * 80% of the line over Re-roll's 20%.
 *
 * ⚠️ `players[i]` pairs with `formation.slots[i]` — `chaosDraft` fills in slot order on
 * every policy path, and the old DraftScreen leaned on the same alignment.
 */
export function DraftScreen({ home, opponent, exiting, reduced, onReroll, onPlay }: Props) {
  const t = useTranslations("game");
  const avgHome = avgOf(home);
  const avgAway = avgOf(opponent);

  const dots = (team: GameTeam, side: "home" | "away") => {
    const maxRow = Math.max(...team.formation.slots.map((s) => s.row));
    return team.formation.slots.map((slot, i) => {
      const player = team.players[i];
      if (player == null) return null;
      const rowWidth = team.formation.slots.filter((s) => s.row === slot.row).length;
      const fx = maxRow === 1 ? 24 : 4 + ((slot.row - 1) / (maxRow - 1)) * 40;
      const left = side === "home" ? fx : 100 - fx;
      const top = (slot.col / (rowWidth + 1)) * 100;
      return (
        <span
          key={player.playerId}
          className={`mn-dot mn-dot-${side}`}
          style={{ left: `${left}%`, top: `${top}%` }}
        >
          <b>{player.ratings?.overall ?? "–"}</b>
          <i>{displayName(player.name)}</i>
        </span>
      );
    });
  };

  const faces = (team: GameTeam, delayFrom: number) =>
    team.players.map((p, i) => (
      <div key={p.playerId} data-exit={exiting} className="mn-card">
        <div className="mn-card-scale">
          <div
            className="mn-card-flip"
            style={
              reduced ? { animation: "none" } : { animationDelay: `${(delayFrom + i) * 90}ms` }
            }
          >
            <div className="mn-card-front">
              <PlayerCard card={p as EnrichedCard} reduced={reduced} />
            </div>
            <div className="mn-card-backside" aria-hidden>
              <CardBack card={p as EnrichedCard} back={pickBack(p as EnrichedCard)} />
            </div>
          </div>
        </div>
      </div>
    ));

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("chaosTitle")}</h1>
      <p className="text-muted-foreground mb-5 mt-1 text-sm">{t("chaosSubtitle")}</p>

      {/* ---- the versus board: both averages, both shapes ---- */}
      <div className="mn-board" role="group" aria-label={t("mnBoardAria")}>
        <div className="mn-board-cell">
          <span className="mn-board-label">{t("yourXi")}</span>
          <span className="mn-board-num">{avgHome}</span>
          <span className="mn-tag mn-tag-home">{home.formation.name}</span>
        </div>
        <span className="mn-vs" aria-hidden>
          {t("mnVersus")}
        </span>
        <div className="mn-board-cell">
          <span className="mn-board-label">{opponent.name}</span>
          <span className="mn-board-num mn-board-num-away">{avgAway}</span>
          <span className="mn-tag mn-tag-away">{opponent.formation.name}</span>
        </div>
      </div>

      {/* ---- both formations on one pitch, yours attacking right ---- */}
      <div className="mn-pitch" role="img" aria-label={t("livePitchAria")}>
        <span className="mn-line mn-mid" aria-hidden />
        <span className="mn-line mn-circle" aria-hidden />
        <span className="mn-line mn-box mn-box-left" aria-hidden />
        <span className="mn-line mn-box mn-box-right" aria-hidden />
        {dots(home, "home")}
        {dots(opponent, "away")}
      </div>

      {/* ---- the squads, face to face, dealt face-down and flipped ---- */}
      <div className="mn-face">
        <div role="group" aria-label={t("draftAria")} className="mn-panel">
          <p className="mn-panel-label">{t("yourXi")}</p>
          <div className="mn-cards">{faces(home, 0)}</div>
        </div>
        <div className="mn-mid-col" aria-hidden>
          <span className="mn-vs">{t("mnVersus")}</span>
          <span className="mn-mid-avgs">
            {avgHome} · {avgAway}
          </span>
        </div>
        <div className="mn-panel">
          <p className="mn-panel-label">{opponent.name}</p>
          <div className="mn-cards">{faces(opponent, home.players.length)}</div>
        </div>
      </div>

      {/* ---- Re-roll 20% · Play 80%, pulsing while the page waits ---- */}
      <div className="mn-actions">
        <button
          type="button"
          onClick={onReroll}
          className="border-border bg-muted rounded-md border px-4 py-2 text-sm font-semibold"
        >
          {t("reroll")}
        </button>
        <button
          type="button"
          onClick={onPlay}
          data-reduced={reduced ? "true" : undefined}
          className="draft-play bg-primary text-primary-foreground rounded-md px-5 py-3 text-sm font-bold"
        >
          {t("playMatch")}
        </button>
      </div>
    </div>
  );
}
