"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { BoundaryPanel } from "@/components/BoundaryPanel";
import { Button } from "@/components/ui/button";

// Route-scoped 404 for `/managers/[id]` (TASK-1503 "VAR review" panel). Copy is
// localized via useTranslations (TASK-1603).
//
// ⛔ CLIENT COMPONENT ON PURPOSE — do NOT convert this back to a Server
// Component calling `getTranslations()` (TASK-M89). A boundary file receives no
// `params`, so it can never call `setRequestLocale()`; a next-intl SERVER call
// without a locale resolves the request config to `defaultLocale` and memoizes
// it for the whole render. Next prerenders this boundary as part of the
// segment's shell, so that poisoning landed BEFORE the page and the shared
// layout rendered — every `/ar/managers/[id]` page shipped the English catalog
// while `<html lang="ar">` (which comes from `params`) stayed correct and hid
// it. `useTranslations` reads the client provider, which the layout hands an
// explicit `locale`, so it cannot poison anything. Same pattern `error.tsx` is
// forced into by Next; guarded by tests/unit/i18n-boundary-locale.test.ts.
export default function NotFound() {
  const t = useTranslations("notFound");
  const tb = useTranslations("boundaries");
  const tn = useTranslations("nav");
  return (
    <BoundaryPanel
      tag={tb("notFoundTag")}
      title={t("managerTitle")}
      description={t("managerDescription")}
    >
      <Button asChild>
        <Link href="/managers">{t("browseManagers")}</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/">{tn("dashboard")}</Link>
      </Button>
    </BoundaryPanel>
  );
}
