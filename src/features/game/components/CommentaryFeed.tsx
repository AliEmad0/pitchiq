"use client";
import { useLocale, useTranslations } from "next-intl";
import type { CommentaryRef } from "@/features/game/domain/commentary";
import type { MatchEventKind } from "@/features/game/domain/match-types";
import { commentaryArgs } from "@/features/game/view/commentary-view";
import { localizeDigits } from "@/utils/format";

export interface FeedLine {
  minute: number;
  kind: MatchEventKind;
  commentary: CommentaryRef;
}

interface Props {
  lines: FeedLine[];
  ariaLabel: string;
}

/** Scrollable recent-history feed of commentary lines, newest first (#5). */
export function CommentaryFeed({ lines, ariaLabel }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const recent = [...lines].reverse();
  return (
    <ul
      role="log"
      aria-label={ariaLabel}
      aria-live="off"
      className="max-h-28 divide-y divide-white/5 overflow-y-auto rounded-md bg-[#06140d]/95 text-white"
    >
      {recent.map((l, i) => {
        const emphatic =
          l.kind === "goal" || l.kind === "card" || l.kind === "penalty" || l.kind === "var";
        // One dot colour per family, so a feed can be skimmed without reading it.
        const dot =
          l.kind === "goal"
            ? "bg-[#f6c000]"
            : l.kind === "card"
              ? "bg-[#ff4b4b]"
              : l.kind === "penalty"
                ? "bg-[#fbbf24]"
                : l.kind === "var"
                  ? "bg-[#7dd3fc]"
                  : l.kind === "injury"
                    ? "bg-[#fb923c]"
                    : l.kind === "substitution"
                      ? "bg-[#a3e635]"
                      : "bg-white/25";
        return (
          <li
            key={`${l.minute}-${lines.length - i}`}
            className="flex items-center gap-2 px-3 py-1.5"
          >
            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span
              className={`min-w-0 flex-1 truncate text-xs ${emphatic ? "font-semibold" : "text-[#c7d2c9]"}`}
            >
              {t(l.commentary.key, commentaryArgs(l.commentary, locale))}
            </span>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-[#8fa397]">
              {localizeDigits(l.minute, locale)}
              {"'"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
