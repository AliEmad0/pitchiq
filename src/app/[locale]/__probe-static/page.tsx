import { setRequestLocale } from "next-intl/server";

// TEMPORARY diagnostic (hosting-cost investigation, 2026-07-29).
//
// Local build artifacts proved unreliable four separate ways, so this asks the
// only trustworthy instrument — production `x-vercel-cache` — a single question:
// can ANY page under [locale] be served from the CDN on this stack?
//
// No data access, no dynamic API, force-static. If production still reports
// MISS + `private, no-store` for THIS, the fault is the framework/adapter, not
// our pages. Delete once answered.
export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "ar" }];
}

export default async function ProbeStatic({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // No literal text: this file lives under app/[locale], which the TASK-1603
  // no-hardcoded-strings guard scans.
  return <div data-probe="static" />;
}
