"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

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
import { withSeason } from "@/utils/season";
import { seasonFromPathname } from "@/utils/season-path";

import { NAV_ITEMS } from "./nav-items";

// Mobile drawer navigation (TASK-103). Trigger is `md:hidden` so the whole
// component evaporates on desktop where Header's inline `<nav>` takes over.
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
        <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("openNav")}>
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col gap-0">
        <SheetHeader>
          <SheetTitle>{t("menu")}</SheetTitle>
          <SheetDescription className="sr-only">{t("navDescription")}</SheetDescription>
        </SheetHeader>
        {/* Links carry the active ?season= so the drawer doesn't reset the
            season. useSearchParams → wrapped in Suspense (AppShell gotcha); the
            fallback renders the same links with bare hrefs. */}
        <Suspense fallback={<MobileNavLinks season={null} onNavigate={() => setOpen(false)} />}>
          <MobileNavLinksWithSeason onNavigate={() => setOpen(false)} />
        </Suspense>
      </SheetContent>
    </Sheet>
  );
}

function MobileNavLinksWithSeason({ onNavigate }: { onNavigate: () => void }) {
  // TASK-M71a: mirror of <PrimaryNav> — the path season wins on
  // `/seasons/<year>`, `?season=` covers the not-yet-migrated routes.
  const pathname = usePathname();
  const query = useSearchParams().get("season");
  const pathSeason = seasonFromPathname(pathname);
  return (
    <MobileNavLinks
      season={pathSeason !== null ? String(pathSeason) : query}
      onNavigate={onNavigate}
    />
  );
}

function MobileNavLinks({ season, onNavigate }: { season: string | null; onNavigate: () => void }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tc = useTranslations("controls");
  const seasonNum = season ? Number.parseInt(season, 10) : NaN;
  const linkFor = (href: string) =>
    Number.isFinite(seasonNum) ? withSeason(href, seasonNum) : href;

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
