import { setRequestLocale } from "next-intl/server";

// TEMPORARY diagnostic (hosting-cost investigation, 2026-07-29).
//
// The ISR counterpart to __probe-static: same shape as our real entity pages
// (generateStaticParams + revalidate) but with zero data access. Isolates
// whether ISR itself works here, or whether it is our data loading that
// de-optimises the render. Delete once answered.
export const revalidate = 3600;

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "ar" }];
}

export default async function ProbeIsr({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <div>probe-isr</div>;
}
