"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { BoundaryPanel } from "@/components/BoundaryPanel";
import { Button } from "@/components/ui/button";

// Route-scoped 404 for `/players/[id]` (TASK-1503 "VAR review" panel). Triggered
// when the URL param isn't an integer or `getPlayerProfile(id)` resolves to null
// (the player id isn't in the selected season's snapshot). Copy is localized via
// useTranslations (TASK-1603).
//
// ⛔ CLIENT COMPONENT ON PURPOSE — see the note in
// `managers/[id]/not-found.tsx`. A `getTranslations()` call here poisons
// next-intl's request config to `defaultLocale` for the whole prerendered
// segment (TASK-M89); this route was the largest victim, 537 pages per locale.
// Guarded by tests/unit/i18n-boundary-locale.test.ts.
export default function PlayerNotFound() {
  const t = useTranslations("notFound");
  const tb = useTranslations("boundaries");
  const tn = useTranslations("nav");
  return (
    <BoundaryPanel
      tag={tb("notFoundTag")}
      title={t("playerTitle")}
      description={
        <>
          <p>{t("playerDescription1")}</p>
          <p>{t("playerDescription2")}</p>
        </>
      }
    >
      <Button asChild>
        <Link href="/compare">{t("comparePlayers")}</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/">{tn("dashboard")}</Link>
      </Button>
    </BoundaryPanel>
  );
}
