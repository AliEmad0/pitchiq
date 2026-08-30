import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Oswald,
  VT323,
  Rajdhani,
  Titillium_Web,
  Noto_Sans_Arabic,
  Noto_Nastaliq_Urdu,
} from "next/font/google";
import { notFound } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Suspense } from "react";

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { LoadingScreen } from "@/components/LoadingScreen";
import { RevealController } from "@/components/RevealController";
import { RouteTransitionArrival } from "@/components/RouteTransitionArrival";
import { ScrollToTop } from "@/components/ScrollToTop";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { EraController } from "@/components/theme/EraController";
import { DailyBubble } from "@/features/game/components/DailyBubble";
import { routing } from "@/i18n/routing";
import { REVEAL_GATE_SCRIPT } from "@/utils/reveal";
import { getSiteUrl } from "@/utils/site-url";

import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Era display fonts (TASK-M25), exposed as CSS vars. next/font self-hosts these;
// the browser only downloads a family when a glyph uses it, so the Modern
// baseline (which never references them) pays no download cost.
const oswald = Oswald({ variable: "--font-oswald", subsets: ["latin"], weight: ["500", "700"] });
const vt323 = VT323({ variable: "--font-vt323", subsets: ["latin"], weight: "400" });
const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["600", "700"],
});
const titillium = Titillium_Web({
  variable: "--font-titillium",
  subsets: ["latin"],
  weight: ["400", "600"],
});

// TASK-1602 — Arabic webfont. Applied under `[lang="ar"]` in globals.css so
// Arabic text is always rendered with a proper Arabic face (the Latin era fonts
// — Oswald/Rajdhani/etc. — carry no Arabic glyphs). One consistent, readable
// Arabic family across all three eras; the era THEME (colours/chrome) still
// applies.
const notoArabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
});

// Nastaliq calligraphic face for the Arabic brand wordmark only (بيتش آي كيو —
// owner-picked design #6). Scoped to <PitchIQLogo> via --font-nastaliq; the rest
// of the Arabic UI stays on Noto Sans Arabic.
const notoNastaliq = Noto_Nastaliq_Urdu({
  variable: "--font-nastaliq",
  subsets: ["arabic"],
  weight: ["400", "700"],
});

// TASK-M25 — no-flash era script: sets `data-era` on <html> BEFORE first paint
// so a hard refresh on a 90s/2000s season never flashes the modern theme. The
// thresholds mirror `eraForSeason` (src/utils/era.ts) — keep in sync. The
// pathname match tolerates an optional `/ar` locale prefix (TASK-1601).
const ERA_NO_FLASH_SCRIPT = `(function(){try{
var p=new URLSearchParams(location.search),s=p.get('season'),y=s?parseInt(s,10):NaN;
if(isNaN(y)){var m=location.pathname.match(/^\\/(?:ar\\/)?fixtures\\/(\\d{4})-(\\d{2})-\\d{2}-/);if(m){var yr=+m[1],mo=+m[2];y=mo>=8?yr:yr-1;}}
var e=y<=1999?'retro90s':(y<=2009?'goldenMillennium':null),el=document.documentElement;
if(e)el.dataset.era=e;else delete el.dataset.era;
}catch(_){}})();`;

const SITE_DESCRIPTION =
  "PitchIQ decodes the Premier League — live standings, leaderboards, fixtures, half-time scores, and head-to-head player comparisons across 34 seasons.";

const SITE_TITLE_DEFAULT = "PitchIQ — Premier League, decoded.";

// Search-engine ownership verification. The codes are not secret (they ship in
// the page HTML), so they live in plain env vars read here at build time — set
// them in the deploy environment and Next emits the corresponding <meta> tag;
// leave them unset and no tag is rendered.
//   GOOGLE_SITE_VERIFICATION → <meta name="google-site-verification">
//   BING_SITE_VERIFICATION   → <meta name="msvalidate.01">
const GOOGLE_SITE_VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION;
const BING_SITE_VERIFICATION = process.env.BING_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  applicationName: "PitchIQ",
  title: {
    template: "%s — PitchIQ",
    default: SITE_TITLE_DEFAULT,
  },
  description: SITE_DESCRIPTION,
  verification: {
    // Next omits each tag when its value is undefined.
    google: GOOGLE_SITE_VERIFICATION,
    other: BING_SITE_VERIFICATION ? { "msvalidate.01": BING_SITE_VERIFICATION } : {},
  },
  openGraph: {
    type: "website",
    siteName: "PitchIQ",
    locale: "en_GB",
    title: SITE_TITLE_DEFAULT,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE_DEFAULT,
    description: SITE_DESCRIPTION,
  },
};

/**
 * Locales written right-to-left. Kept as DATA and deliberately independent of
 * `routing.locales` (TASK-1843): Arabic is parked out of the routing array for the build
 * budget, but the RTL knowledge and every logical-property rule in `globals.css` stay, so
 * restoring the locale is one edit in `src/i18n/routing.ts` rather than a hunt.
 */
const RTL_LOCALES = ["ar"] as const;

// ⛔ EVERY LOCALE HERE MULTIPLIES THE WHOLE SITE. This returns `routing.locales`, so it is the
// multiplier behind the 38,121-page build that failed Vercel's 45-minute limit on 2026-08-30.
// Guarded by tests/unit/i18n-routing.test.ts.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  // Enables static rendering for this locale subtree under next-intl — without
  // it, getMessages()/getTranslations() (used here + in <Footer>) would force
  // the whole route to render dynamically.
  setRequestLocale(locale);
  const messages = await getMessages();
  // ⚠️ Compared as a plain string list, NOT `locale === "ar"` (TASK-1843). With Arabic parked,
  // `routing.locales` narrows to the literal `"en"`, and a `=== "ar"` check is then a
  // no-overlap TYPE ERROR that fails the build. Keeping the RTL knowledge here as data means
  // putting `"ar"` back in `routing.locales` is the only edit restoring it needs.
  const dir = (RTL_LOCALES as readonly string[]).includes(locale) ? "rtl" : "ltr";

  return (
    // `suppressHydrationWarning` silences the class-mismatch React would
    // otherwise log when next-themes injects the resolved theme class on
    // <html> before hydration completes.
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${oswald.variable} ${vt323.variable} ${rajdhani.variable} ${titillium.variable} ${notoArabic.variable} ${notoNastaliq.variable} flex min-h-screen flex-col antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: ERA_NO_FLASH_SCRIPT }} />
        {/* TASK-1704 — pre-paint reveal gate: hidden states in globals.css
            only apply once <html data-reveal-ready> is stamped, so no-JS and
            reduced-motion visits never see hidden content. */}
        <script dangerouslySetInnerHTML={{ __html: REVEAL_GATE_SCRIPT }} />
        {/* `locale` MUST be passed explicitly. Without it next-intl infers the
            locale from request context — which `dynamic = "force-static"`
            removes — so on a prerendered page `useLocale()` on the CLIENT
            falls back to `defaultLocale` ("en") even though the server render
            is correctly Arabic (`<html lang="ar" dir="rtl">`). That silently
            broke every client-side fetch that forwards the locale: the
            `?season=` swap in <PlayerSeasonView> requested
            `/api/players/[id]/profile?locale=en` on /ar and replaced the
            Arabic name with the Latin one. Caught by tests/e2e/ar-data.spec.ts. */}
        <NextIntlClientProvider locale={locale} messages={messages}>
          {/* TASK-1702 boot loader — inside the intl provider (the wordmark
              localizes) but outside the theme/query providers it doesn't need.
              SSR-painted; removes itself once per session via its inline
              script, else auto-fades via CSS. */}
          <LoadingScreen />
          <NuqsAdapter>
            <ThemeProvider>
              <QueryProvider>
                <Suspense fallback={null}>
                  <EraController />
                </Suspense>
                <Suspense fallback={null}>
                  <RouteTransitionArrival />
                </Suspense>
                <ScrollToTop />
                <RevealController />
                <Header />
                <div className="era-ceefax" aria-hidden="true">
                  <span className="cfx-page">CEEFAX 302</span>
                  <span>PREMIER LEAGUE</span>
                  <span className="cfx-page">P302</span>
                </div>
                <main className="flex flex-1 flex-col">{children}</main>
                <Footer />
                {/* TASK-1817 — the daily challenge sits two clicks deep behind the mode
                    gate, and a daily only becomes a habit if returning is frictionless.
                    The header's width budget is measured and already spent (TASK-M79/M80),
                    so this floats instead of taking a seventh pill. */}
                <DailyBubble />
              </QueryProvider>
            </ThemeProvider>
          </NuqsAdapter>
        </NextIntlClientProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
