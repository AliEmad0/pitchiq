"use client";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { shareUrl } from "@/features/game/view/share-link";

/**
 * Copy this match's link.
 *
 * ⚠️ The URL is absolutised in the BROWSER rather than from a configured origin, so a link
 * copied out of a preview deployment points at that deployment instead of silently at
 * production.
 */
export function ShareLink({
  code,
  locale,
  path,
}: {
  code: string;
  locale: string;
  /** The route this match replays on. Absent = the canonical `/game/draft`. */
  path?: string;
}) {
  const t = useTranslations("game");
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  // Clearing on unmount: the summary can be replaced by a new draft inside the two
  // seconds, and setting state afterwards would warn.
  useEffect(() => {
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    const url = new URL(shareUrl(code, locale, path), window.location.origin).toString();
    await navigator.clipboard.writeText(url);
    setCopied(true);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => void copy()}
        className="bg-primary text-primary-foreground rounded-md px-5 py-2 text-sm font-bold"
      >
        {t("shareCopy")}
      </button>
      {/* Polite, not assertive: a confirmation should not interrupt a screen reader. */}
      <span aria-live="polite" className="text-muted-foreground text-xs">
        {copied ? t("shareCopied") : null}
      </span>
    </div>
  );
}
