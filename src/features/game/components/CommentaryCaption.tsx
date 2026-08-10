"use client";
import { useTranslations } from "next-intl";
import type { CommentaryRef } from "@/features/game/domain/commentary";
import { commentaryArgs } from "@/features/game/view/commentary-view";

interface Props {
  commentary: CommentaryRef;
  minute: number;
  ariaLabel: string;
}

export function CommentaryCaption({ commentary, minute, ariaLabel }: Props) {
  const t = useTranslations();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className="flex items-center gap-2 overflow-hidden rounded-md border-l-[3px] border-[#f6c000] bg-[#06140d]/95 px-3 py-2 text-white"
    >
      <span className="truncate text-sm font-semibold">
        {t(commentary.key, commentaryArgs(commentary))}
      </span>
      <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-[#c7d2c9]">
        {minute}
        {"'"}
      </span>
    </div>
  );
}
