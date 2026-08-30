"use client";

import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";

import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { isRtl } from "@/utils/format";

// A two-state toggle (en ⇄ ar). Preserves the current path + ?season= when
// swapping locale; next-intl's router applies the locale prefix (`/ar/…`, or
// un-prefixed for the default en under `as-needed` routing). The locale itself
// lives in the URL (Arabic) + next-intl's cookie, so the choice persists.
export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // `useLocale()` is "ar-u-nu-arab" on Arabic (Eastern-Arabic numeral formatting,
  // see src/i18n/request.ts) — use isRtl, not `=== "ar"`.
  const next = isRtl(locale) ? "en" : "ar";

  // ⛔ Nothing to switch TO while Arabic is parked (TASK-1843). This component names its two
  // locales literally rather than reading `routing.locales`, so without this gate it kept
  // offering "ع" — a button that navigates to `/ar`, which next.config.ts now 301s straight
  // back to English. A control that visibly does nothing is worse than no control.
  // Restoring `"ar"` to `routing.locales` brings the toggle back with no edit here.
  if (routing.locales.length < 2) return null;

  function switchTo() {
    const query = Object.fromEntries(searchParams.entries());
    router.replace({ pathname, query }, { locale: next });
  }

  return (
    <button
      type="button"
      onClick={switchTo}
      className="ix-glow ix-press hover:bg-accent inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-medium"
      aria-label={next === "ar" ? "التبديل إلى العربية" : "Switch to English"}
    >
      {next === "ar" ? "ع" : "EN"}
    </button>
  );
}
