"use client";
import { useTranslations } from "next-intl";
import type { PlayerBadges } from "@/features/game/view/lineup-state";
import type { PitchPlayer } from "@/features/game/view/match-view-model";

export interface SheetRow {
  player: PitchPlayer;
  captain: boolean;
  onPitch: boolean;
  /**
   * What happened to him, already tallied.
   *
   * ⚠️ Taken from `lineupAt`, never re-derived from the event list. An ASSIST is recorded
   * on the goal event under `assistPlayerId`, so filtering events by `playerId` misses
   * every assist — which is exactly what the first version of this sheet did.
   */
  badges: PlayerBadges;
  /** He was carried off. */
  injured: boolean;
}

interface Props {
  home: SheetRow[];
  away: SheetRow[];
  homeCaption: string;
  awayCaption: string;
  title: string;
}

/**
 * TASK-1810 — the team sheets, two ruled columns.
 *
 * ⭐ Each player carries HIS OWN MATCH on his row: the feed answers "what just happened",
 * the sheet answers "what has he done".
 */
export function TeamSheets({ home, away, homeCaption, awayCaption, title }: Props) {
  const t = useTranslations("game");

  /** One badge per thing that happened to him, in the order a report would list them. */
  const marksOf = (r: SheetRow) => {
    const b = r.badges;
    const out: Array<{ key: string; glyph: string; label: string }> = [];
    if (b.goals > 0) {
      out.push({
        key: "g",
        glyph: b.goals > 1 ? `⚽${b.goals}` : "⚽",
        label: t("badgeGoal"),
      });
    }
    if (b.assists > 0) {
      out.push({
        key: "a",
        glyph: b.assists > 1 ? `🅰${b.assists}` : "🅰",
        label: t("badgeAssist"),
      });
    }
    // ⚠️ A yellow AND a red is a SECOND booking, not two separate offences — it must read
    // 🟨🟥, because a straight red and a second yellow are different things.
    if (b.yellow && b.red) {
      out.push({ key: "y2", glyph: "🟨🟥", label: t("badgeSecondYellow") });
    } else if (b.red) {
      out.push({ key: "r", glyph: "🟥", label: t("badgeRed") });
    } else if (b.yellow) {
      out.push({ key: "y", glyph: "🟨", label: t("badgeYellow") });
    }
    if (r.injured) out.push({ key: "inj", glyph: "🚑", label: t("badgeInjury") });
    // The substitution NUMBER, so two changes in one match can be told apart.
    if (b.subOn != null) {
      out.push({ key: "on", glyph: `▲${b.subOn}`, label: t("badgeSubOn") });
    }
    if (b.subOff != null) {
      out.push({ key: "off", glyph: `▼${b.subOff}`, label: t("badgeSubOff") });
    }
    return out;
  };

  const column = (rows: SheetRow[], side: "home" | "away", caption: string) => (
    <div className={`lg-sheet lg-sheet-${side}`}>
      <p className="lg-sheet-cap">{caption}</p>
      <ul className="lg-sheet-list">
        {rows.map((r, i) => {
          const marks = marksOf(r);
          return (
            <li
              key={`${side}-${r.player.playerId}-${i}`}
              data-testid="sheet-row"
              className={`lg-sheet-row${marks.length > 0 ? " lg-sheet-live" : ""}${
                r.onPitch ? "" : " lg-sheet-gone"
              }`}
            >
              {/* The shirt number — the same one his dot wears on the pitch. */}
              <span className="lg-sheet-num">{r.player.number}</span>
              <span className="lg-sheet-pos">{r.player.role}</span>
              <span className="lg-sheet-name">
                {r.player.name}
                {r.captain ? (
                  <span className="lg-sheet-c" title={t("benchCaptain")}>
                    C
                  </span>
                ) : null}
              </span>
              <span className="lg-sheet-marks">
                {marks.map((m) => (
                  <span key={m.key} className="lg-mark" title={m.label} aria-label={m.label}>
                    {m.glyph}
                  </span>
                ))}
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
