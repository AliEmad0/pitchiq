"use client";
import { useTranslations } from "next-intl";

/**
 * The Chaos draft's entry state.
 *
 * `/game/chaos` is `force-static`, so the prerendered HTML is identical for everyone
 * and a per-visitor squad can only be drawn after hydration. Rendering THIS on the
 * server (rather than a placeholder XI) means the visitor never sees a lineup that is
 * about to be swapped out — the squad they see first is already their own.
 *
 * The bar animates `transform: scaleX()`, never `width`: the CI motion audit fails any
 * keyframe that animates a layout property.
 */
export function ChaosGenerating({ reduced }: { reduced: boolean }) {
  const t = useTranslations("game");

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
      <p className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
        {t("generating")}
      </p>
      <div
        role="progressbar"
        aria-label={t("generating")}
        className="bg-muted h-1.5 w-64 max-w-[80vw] overflow-hidden rounded-full"
      >
        <div
          className="bg-primary chaos-generate-bar h-full w-full origin-left rounded-full"
          data-reduced={reduced ? "true" : undefined}
        />
      </div>
    </div>
  );
}
