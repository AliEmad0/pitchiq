"use client";
import { useTranslations } from "next-intl";
import type { CommentaryRef } from "@/features/game/domain/commentary";
import { commentaryArgs } from "@/features/game/view/commentary-view";

export interface OverlayEvent {
  kind: "goal" | "card" | "penalty" | "var" | "injury" | "substitution";
  card?: "yellow" | "red";
  name: string;
  number: number;
  commentary: CommentaryRef;
}

interface Props {
  event: OverlayEvent;
}

/** Full-pitch banner for a high-impact moment — held while playback pauses (#3). */
export function EventOverlay({ event }: Props) {
  const t = useTranslations();
  const g = useTranslations("game");
  // Each moment gets its own icon, label and accent so a penalty never looks like a
  // goal and a substitution never looks like a sending-off.
  const look = {
    goal: { icon: "⚽", label: g("goalLabel"), accent: "#f6c000" },
    card: { icon: "🟥", label: g("redCardLabel"), accent: "#ff4b4b" },
    penalty: { icon: "🎯", label: g("penaltyLabel"), accent: "#f6c000" },
    var: { icon: "📺", label: g("varLabel"), accent: "#7dd3fc" },
    injury: { icon: "🚑", label: g("injuryLabel"), accent: "#fb923c" },
    substitution: { icon: "🔄", label: g("subLabel"), accent: "#a3e635" },
  }[event.kind];
  const { icon, label, accent } = look;
  return (
    <div
      role="status"
      aria-label={g("eventAria")}
      className="absolute inset-0 z-20 grid place-items-center bg-black/45 px-4"
    >
      <div
        className="game-event-overlay flex w-full max-w-sm flex-col items-center gap-2 rounded-xl border-t-4 bg-[#06140d]/95 px-6 py-5 text-center text-white shadow-2xl"
        style={{ borderColor: accent }}
      >
        <span aria-hidden="true" className="text-4xl leading-none">
          {icon}
        </span>
        <span className="font-mono text-sm font-black tracking-[0.2em]" style={{ color: accent }}>
          {label}
        </span>
        <span className="flex items-center gap-2 text-lg font-extrabold">
          <span
            className="grid h-7 w-7 place-items-center rounded-md bg-white/10 font-mono text-sm tabular-nums"
            aria-hidden="true"
          >
            {event.number}
          </span>
          {event.name}
        </span>
        <span className="text-sm text-[#c7d2c9]">
          {t(event.commentary.key, commentaryArgs(event.commentary))}
        </span>
      </div>
    </div>
  );
}
