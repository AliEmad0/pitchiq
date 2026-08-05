"use client";
import { useTranslations } from "next-intl";
import type { CommentaryRef } from "@/features/game/domain/commentary";
import { commentaryArgs } from "@/features/game/view/commentary-view";
import { localizeDigits } from "@/utils/format";

export interface OverlayEvent {
  kind: "goal" | "card";
  card?: "yellow" | "red";
  name: string;
  number: number;
  commentary: CommentaryRef;
}

interface Props {
  event: OverlayEvent;
  locale: string;
}

/** Full-pitch banner for a high-impact moment — held while playback pauses (#3). */
export function EventOverlay({ event, locale }: Props) {
  const t = useTranslations();
  const g = useTranslations("game");
  const isGoal = event.kind === "goal";
  const icon = isGoal ? "⚽" : "🟥";
  const label = isGoal ? g("goalLabel") : g("redCardLabel");
  const accent = isGoal ? "#f6c000" : "#ff4b4b";
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
            {localizeDigits(event.number, locale)}
          </span>
          {event.name}
        </span>
        <span className="text-sm text-[#c7d2c9]">
          {t(event.commentary.key, commentaryArgs(event.commentary, locale))}
        </span>
      </div>
    </div>
  );
}
