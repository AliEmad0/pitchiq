"use client";
import { useTranslations } from "next-intl";
import type { PitchPlayer, ViewEvent } from "@/features/game/view/match-view-model";

export interface SheetRow {
  player: PitchPlayer;
  captain: boolean;
  onPitch: boolean;
  /** This player's own match, in minute order. */
  own: ViewEvent[];
}

interface Props {
  home: SheetRow[];
  away: SheetRow[];
  homeCaption: string;
  awayCaption: string;
  title: string;
}

/**
 * One glyph per thing that happened to him.
 *
 * ⚠️ A red card renders 🟥, NOT the yellow badge. They are the same event kind separated
 * only by `card`, which is exactly how a sending-off ends up looking like a booking.
 */
function marks(own: ViewEvent[]): string {
  return own
    .map((e) => {
      if (e.kind === "goal") return "⚽";
      if (e.kind === "card") return e.card === "red" ? "🟥" : "🟨";
      if (e.kind === "substitution") return "🔄";
      if (e.kind === "injury") return "🚑";
      return "";
    })
    .join("");
}

/**
 * TASK-1810 — the team sheets, two ruled columns.
 *
 * ⭐ Each player carries HIS OWN MATCH on his row: the same event stream the feed prints,
 * regrouped by *who* rather than by *when*. That is the whole idea — the feed answers
 * "what just happened", the sheet answers "what has he done".
 *
 * Rows with events lift slightly, so a sheet can be skimmed for the players who did
 * something without reading any of it.
 */
export function TeamSheets({ home, away, homeCaption, awayCaption, title }: Props) {
  const t = useTranslations("game");

  const column = (rows: SheetRow[], side: "home" | "away", caption: string) => (
    <div className={`lg-sheet lg-sheet-${side}`}>
      <p className="lg-sheet-cap">{caption}</p>
      <ul className="lg-sheet-list">
        {rows.map((r, i) => {
          const m = marks(r.own);
          return (
            <li
              key={`${side}-${r.player.playerId}-${i}`}
              data-testid="sheet-row"
              className={`lg-sheet-row${m !== "" ? " lg-sheet-live" : ""}${
                r.onPitch ? "" : " lg-sheet-gone"
              }`}
            >
              <span className="lg-sheet-pos">{r.player.role}</span>
              <span className="lg-sheet-name">
                {r.player.name}
                {r.captain ? (
                  <span className="lg-sheet-c" title={t("benchCaptain")}>
                    C
                  </span>
                ) : null}
              </span>
              <span className="lg-sheet-marks" aria-hidden="true">
                {m}
              </span>
              <span className="lg-sheet-ovr">{r.player.rating ?? "—"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <section className="lg-sheets" aria-label={title}>
      {column(home, "home", homeCaption)}
      {column(away, "away", awayCaption)}
    </section>
  );
}
