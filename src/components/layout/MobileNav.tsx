"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Link, usePathname } from "@/i18n/navigation";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/utils/cn";
import { currentDataSeason } from "@/utils/season";
import { navHrefForSeason, seasonFromPathname } from "@/utils/season-path";

import { NAV_ITEMS } from "./nav-items";

// Mobile drawer navigation (TASK-103). Trigger is `lg:hidden` so the whole
// component evaporates on desktop where Header's inline `<nav>` takes over.
// TASK-M79 raised that from `md`: the header cannot fit the pill row until
// ~985px, so between 768px and `lg` the drawer *is* the navigation — and it
// always listed every route, so nothing became unreachable in that band.
// ⚠️ This is the exact complement of PrimaryNav's `hidden lg:flex`; the two
// must move together or that band gets no navigation at all.
// Sheet animation + Esc-to-close + focus trap come from Radix Dialog under
// the hood.
//
// Closing on link click is explicit: Next's `<Link>` does client-side
// navigation without unmounting the Sheet, so we drive `open` state and
// call `setOpen(false)` on every link's onClick.
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("controls");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("openNav")}>
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col gap-0">
        <SheetHeader>
          <SheetTitle>{t("menu")}</SheetTitle>
          <SheetDescription className="sr-only">{t("navDescription")}</SheetDescription>
        </SheetHeader>
        {/* Links carry the viewed season in the PATH (TASK-M71b) so the drawer
            doesn't reset it. Season comes from the pathname — no useSearchParams,
            so no Suspense boundary needed. */}
        <MobileNavLinks onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function MobileNavLinks({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tc = useTranslations("controls");
  const season = seasonFromPathname(pathname);
  const current = currentDataSeason();
  const linkFor = (href: string) => navHrefForSeason(href, season, current);

  return (
    <nav aria-label={tc("primaryMobileNav")} className="flex flex-col gap-1 px-4">
      {NAV_ITEMS.map((item) => {
        const active = isActiveRoute(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={linkFor(item.href)}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "ix-glow rounded-md px-3 py-2 text-sm font-medium",
              active
                ? "bg-accent text-accent-foreground"
                : "text-foreground/70 hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}

// Mirrors the active-route logic in `NavLink` (TASK-102): exact match on "/"
// so nested routes don't highlight Dashboard; prefix match for everything
// else so `/teams/33` activates the `/teams` row.
function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
