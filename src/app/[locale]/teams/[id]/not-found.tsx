"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { BoundaryPanel } from "@/components/BoundaryPanel";
import { Button } from "@/components/ui/button";

// Route-scoped 404 for `/teams/[id]` (TASK-1503 "VAR review" panel). Triggered
// when the URL param isn't an integer or `getTeam(id)` resolves to null (the
// team id isn't in the current Premier League snapshot). Copy is localized via
// useTranslations (TASK-1603).
//
// ⛔ CLIENT COMPONENT ON PURPOSE — see the note in
// `managers/[id]/not-found.tsx`. A `getTranslations()` call here poisons
// next-intl's request config to `defaultLocale` for the whole prerendered
// segment (TASK-M89). Guarded by tests/unit/i18n-boundary-locale.test.ts.
export default function TeamNotFound() {
  const t = useTranslations("notFound");
  const tb = useTranslations("boundaries");
  const tn = useTranslations("nav");
  return (
    <BoundaryPanel
      tag={tb("notFoundTag")}
      title={t("teamTitle")}
      description={
        <>
          <p>{t("teamDescription1")}</p>
          <p>{t("teamDescription2")}</p>
        </>
      }
    >
      <Button asChild>
        <Link href="/teams">{t("browseAllClubs")}</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/">{tn("dashboard")}</Link>
      </Button>
    </BoundaryPanel>
  );
}
