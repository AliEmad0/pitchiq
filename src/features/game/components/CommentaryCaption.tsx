"use client";
import { useLocale, useTranslations } from "next-intl";
import type { CommentaryRef } from "@/features/game/domain/commentary";
import { commentaryArgs } from "@/features/game/view/commentary-view";
import { localizeDigits } from "@/utils/format";

interface Props {
  commentary: CommentaryRef;
  minute: number;
  ariaLabel: string;
}

export function CommentaryCaption({ commentary, minute, ariaLabel }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className="flex items-center gap-2 overflow-hidden rounded-md border-l-[3px] border-[#f6c000] bg-[#06140d]/95 px-3 py-2 text-white"
    >
      <span className="truncate text-sm font-semibold">
        {t(commentary.key, commentaryArgs(commentary, locale))}
      </span>
      <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-[#c7d2c9]">
        {localizeDigits(minute, locale)}
        {"'"}
      </span>
    </div>
  );
}
