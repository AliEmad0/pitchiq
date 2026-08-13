import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { PitchIQLogo } from "@/components/brand/PitchIQLogo";

import { GlobalSearch } from "./GlobalSearch";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { MobileNav } from "./MobileNav";
import { PrimaryNav } from "./PrimaryNav";
import { SeasonSwitcherLoader } from "./SeasonSwitcherLoader";
import { ThemeToggle } from "./ThemeToggle";

// Server Component. Sticky top bar: brand (left) · segmented pill nav (centre,
// lg+) · controls (right). Phase 15 redesign (TASK-1502): the season chip sits
// far-right AFTER the theme toggle, set off by a divider — not between search
// and theme.
//
// ⚠️ TASK-M79 — nothing in this row shrinks. The pills are content-sized and
// every control is fixed-width, so the row's width is the sum of its parts and
// any excess becomes horizontal scroll on the whole document. Adding anything
// here, or a longer nav label, spends real budget: measured in English at `lg`
// the row needs 893px of the 1009px available. Measure before you add.
export async function Header() {
  const t = await getTranslations("controls");
  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
      <div className="container-page flex h-14 items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight"
          aria-label={t("homeAria")}
        >
          <PitchIQLogo withWordmark />
        </Link>

        <PrimaryNav />

        <div className="flex items-center gap-1 sm:gap-2">
          <GlobalSearch />
          <ThemeToggle />
          {/* useSearchParams inside LocaleSwitcher requires a Suspense boundary
              or every static page bails out of prerender (the AppShell gotcha).
              TASK-M80 — below `sm` this moves into the mobile drawer instead.
              ⚠️ `MobileNav`'s locale row is the exact complement (`sm:hidden`):
              move one breakpoint and you must move the other, or phones get no
              language control at all (or two of them).
              `tests/unit/header-locale-breakpoint.test.tsx` holds them in step. */}
          <div className="hidden sm:block">
            <Suspense fallback={<Skeleton className="h-9 w-9 rounded-lg" />}>
              <LocaleSwitcher />
            </Suspense>
          </div>
          <span className="bg-border hidden h-6 w-px sm:block" aria-hidden />
          {/* useSearchParams inside SeasonSwitcher (via nuqs) requires a
              Suspense boundary or every static page bails out of prerender.
              The fallback matches the season chip's footprint so the header
              doesn't reflow when the URL state hydrates. */}
          <Suspense fallback={<Skeleton className="h-9 w-[104px] rounded-lg" />}>
            <SeasonSwitcherLoader />
          </Suspense>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
