"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { BoundaryPanel } from "@/components/BoundaryPanel";
import { Button } from "@/components/ui/button";

// App Router 404 boundary (TASK-1503 "VAR review" panel). Next renders this
// whenever a route doesn't match or a Server Component calls `notFound()`. The
// Header/Footer chrome stays mounted since this renders inside <main>. Copy is
// localized via useTranslations (TASK-1603).
//
// ⛔ CLIENT COMPONENT ON PURPOSE — see the note in
// `managers/[id]/not-found.tsx`. This one was not observed poisoning a route,
// but it is the identical hazard: a paramless boundary calling a next-intl
// SERVER API (TASK-M89). Converting it too is what lets
// tests/unit/i18n-boundary-locale.test.ts assert the invariant with NO
// exemptions — an allowlist here is how the next instance would slip back in.
export default function NotFound() {
  const t = useTranslations("boundaries");
  const tc = useTranslations("common");
  return (
    <BoundaryPanel
      tag={t("notFoundTag")}
      title={t("notFoundTitle")}
      description={t("notFoundDescription")}
    >
      <Button asChild>
        <Link href="/">{tc("backToDashboard")}</Link>
      </Button>
    </BoundaryPanel>
  );
}
