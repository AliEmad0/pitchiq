"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Link, usePathname } from "@/i18n/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/cn";
import { withSeason } from "@/utils/season";
import { seasonFromPathname } from "@/utils/season-path";

import { NAV_ITEMS, PRIMARY_NAV_HREFS } from "./nav-items";

// Phase 15 redesign (TASK-1502): a segmented pill nav. The PRIMARY_NAV_HREFS
// render inline; the rest fold into a "More ▾" dropdown. Reads the active
// `?season=` so every link preserves the viewed season (TASK-M25 follow-up);
// `useSearchParams` is wrapped in <Suspense> so static pages still prerender
// (the AppShell gotcha) — the fallback renders the bare-href nav.
const PRIMARY = NAV_ITEMS.filter((i) => PRIMARY_NAV_HREFS.includes(i.href));
const OVERFLOW = NAV_ITEMS.filter((i) => !PRIMARY_NAV_HREFS.includes(i.href));

// Exact match on "/" (otherwise every route matches Dashboard); prefix match
// for nested routes (e.g. /teams/33 → /teams).
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function linkFor(href: string, season: string | null): string {
  const n = season ? Number.parseInt(season, 10) : NaN;
  return Number.isFinite(n) ? withSeason(href, n) : href;
}

function NavList({ season }: { season: string | null }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tc = useTranslations("controls");
  const overflowActive = OVERFLOW.some((i) => isActive(pathname, i.href));

  return (
    <nav className="hidden md:flex" aria-label={tc("primaryNav")}>
      <div className="bg-muted flex items-center gap-0.5 rounded-lg p-1">
        {PRIMARY.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={linkFor(item.href, season)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "ix-glow rounded-md px-3 py-1.5 text-sm font-medium",
                active
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(item.key)}
            </Link>
          );
        })}

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("moreSections")}
            className={cn(
              "ix-glow focus-visible:ring-ring inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2",
              overflowActive
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("more")}
            <ChevronDown className="size-3.5" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[10rem]">
            {OVERFLOW.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <DropdownMenuItem key={item.href} asChild>
                  <Link
                    href={linkFor(item.href, season)}
                    aria-current={active ? "page" : undefined}
                    className={cn("w-full cursor-pointer", active && "text-primary font-medium")}
                  >
                    {t(item.key)}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}

function NavListWithSeason() {
  // TASK-M71a: on `/seasons/<year>` the viewed season lives in the PATH, so
  // links must carry it from there — `?season=` covers the not-yet-migrated
  // routes. The current season (viewed at `/`) stays bare, as before.
  const pathname = usePathname();
  const query = useSearchParams().get("season");
  const pathSeason = seasonFromPathname(pathname);
  return <NavList season={pathSeason !== null ? String(pathSeason) : query} />;
}

export function PrimaryNav() {
  return (
    <Suspense fallback={<NavList season={null} />}>
      <NavListWithSeason />
    </Suspense>
  );
}
