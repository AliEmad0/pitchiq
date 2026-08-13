"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/cn";
import { currentDataSeason } from "@/utils/season";
import { navHrefForSeason, seasonFromPathname } from "@/utils/season-path";

import { NAV_ITEMS, PRIMARY_NAV_HREFS } from "./nav-items";

// Phase 15 redesign (TASK-1502): a segmented pill nav. The PRIMARY_NAV_HREFS
// render inline; the rest fold into a "More ▾" dropdown. Since TASK-M71b the
// viewed season lives entirely in the PATH (no `?season=`), so links carry it
// in the path form via `navHrefForSeason` — e.g. on `/seasons/2003/teams`,
// "Players" → `/seasons/2003/players`; on a current-season page links stay bare.
// No `useSearchParams` anymore, so no Suspense boundary needed (the layout
// stays statically prerenderable).
const PRIMARY = NAV_ITEMS.filter((i) => PRIMARY_NAV_HREFS.includes(i.href));
const OVERFLOW = NAV_ITEMS.filter((i) => !PRIMARY_NAV_HREFS.includes(i.href));

// Exact match on "/" (otherwise every route matches Dashboard); prefix match
// for nested routes (e.g. /teams/33 → /teams).
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PrimaryNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tc = useTranslations("controls");
  const season = seasonFromPathname(pathname);
  const current = currentDataSeason();
  const linkFor = (href: string) => navHrefForSeason(href, season, current);
  const overflowActive = OVERFLOW.some((i) => isActive(pathname, i.href));

  return (
    // TASK-M79 — `lg`, not `md`. The header row is three intrinsically-sized
    // children and nothing in it can shrink, so it needs ~985px before it can
    // hold this pill row (88px logo + 474px nav + 343px controls + 32px gaps +
    // 48px padding, measured in English). Revealing it at `md` (768px) put the
    // pills on screen a quarter of a viewport too early and scrolled the whole
    // document sideways — 157px of overflow at 820px.
    // ⚠️ MobileNav's trigger is the exact complement (`lg:hidden`). Move one
    // and you must move the other, or the gap between them has no navigation
    // at all; `tests/unit/nav-breakpoint.test.tsx` holds them in step.
    <nav className="hidden lg:flex" aria-label={tc("primaryNav")}>
      <div className="bg-muted flex items-center gap-0.5 rounded-lg p-1">
        {PRIMARY.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={linkFor(item.href)}
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
                    href={linkFor(item.href)}
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
