"use client";

import { Link, usePathname } from "@/i18n/navigation";

import { cn } from "@/utils/cn";
import { currentDataSeason } from "@/utils/season";
import { navHrefForSeason } from "@/utils/season-path";

type Props = {
  href: string;
  // The viewed season (from the pathname, or null for the current season).
  // Carried into the link in the PATH form so navigating between sections
  // preserves the season (TASK-M71b). Active-state matching uses the bare href.
  season?: number | null;
  children: React.ReactNode;
};

// Active-link styling for the primary nav. Exact match on "/" (otherwise every
// route would match the Dashboard link); prefix match for nested routes like
// /teams/33 → /teams.
export function NavLink({ href, season, children }: Props) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  const linkHref = navHrefForSeason(href, season ?? null, currentDataSeason());

  return (
    <Link
      href={linkHref}
      aria-current={active ? "page" : undefined}
      className={cn(
        "ix-glow inline-flex h-9 items-center rounded-md px-3 text-sm font-medium",
        active
          ? "bg-accent text-accent-foreground"
          : "text-foreground/70 hover:bg-accent/50 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
