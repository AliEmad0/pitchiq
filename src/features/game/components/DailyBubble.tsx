"use client";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { dayKey } from "@/features/game/domain/daily";
import { loadDaily, wasStarted } from "@/features/game/storage/daily-slot";
import { prefersReducedMotion } from "@/utils/motion";

/**
 * A floating shortcut to the daily challenge, on every page (TASK-1817).
 *
 * The daily lives two clicks deep behind the mode gate, which is fine for someone already
 * playing and useless as a habit — a daily only works if returning is frictionless. The
 * header cannot carry it: its width budget is measured and spent (TASK-M79/M80), so a
 * seventh pill would push the row over at 1024px. A floating control costs the header
 * nothing.
 *
 * ⚠️ Renders NOTHING until after mount. Every route is `force-static`, so reading storage
 * during render would bake one visitor's state into the CDN copy — the same rule the
 * daily container follows.
 */
export function DailyBubble() {
  const t = useTranslations("game");
  const locale = useLocale();
  const pathname = usePathname();
  const reduced = prefersReducedMotion();

  /** null = not resolved yet, so the server and the first client paint agree on "nothing". */
  const [played, setPlayed] = useState<boolean | null>(null);

  // ⚠️ `usePathname`, never `useSearchParams` — the latter bails static prerender for the
  // whole shell, which is exactly the regression TASK-M71 existed to fix.
  const href = locale === "en" ? "/game/daily" : `/${locale}/game/daily`;
  const onDaily = pathname === href;

  useEffect(() => {
    if (onDaily) return;
    let live = true;
    void (async () => {
      const key = dayKey(new Date());
      const record = await loadDaily(key);
      if (!live) return;
      setPlayed((record?.done ?? false) || (record == null && wasStarted(key)));
    })();
    return () => {
      live = false;
    };
    // Re-checked on navigation so finishing the challenge clears the dot without a reload.
  }, [onDaily, pathname]);

  // Nothing to offer on the daily itself, and nothing at all until storage has answered.
  if (onDaily || played == null) return null;

  return (
    <Link
      href={href}
      data-testid="daily-bubble"
      aria-label={played ? t("bubblePlayed") : t("bubbleUnplayed")}
      className={[
        // ⚠️ `end-5` is the LOGICAL inset (inset-inline-end), so RTL mirrors the bubble to
        // the bottom-left for free. `right-5` would strand it under the Arabic layout.
        "fixed bottom-5 end-5 z-40 print:hidden",
        "border-border bg-background/90 flex items-center gap-2 rounded-full border",
        "px-4 py-3 text-sm font-bold shadow-lg backdrop-blur",
        "hover:bg-muted focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none",
        reduced ? "" : "transition-transform hover:scale-105",
      ].join(" ")}
    >
      <span aria-hidden="true" className="text-lg leading-none">
        📅
      </span>
      <span className="hidden sm:inline">{t("bubbleLabel")}</span>
      {played ? null : (
        // The nudge, and the only reason a bubble beats a nav link: an unplayed day is
        // visible from anywhere. `aria-hidden` because the label above already says it.
        <span
          aria-hidden="true"
          data-testid="daily-bubble-dot"
          className="bg-primary absolute end-1 top-1 size-3 rounded-full"
        />
      )}
    </Link>
  );
}
