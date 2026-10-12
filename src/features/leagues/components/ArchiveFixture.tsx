"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { FixtureDetailView } from "@/features/leagues/components/FixtureDetailView";
import type { FixtureDetail } from "@/types/api";

type State =
  | { status: "loading" }
  | { status: "ready"; detail: FixtureDetail }
  | { status: "missing" }
  | { status: "error" };

/** The match id is the last path segment — the middleware rewrite keeps the visitor's URL. */
const idFromPath = (pathname: string): string | null => {
  const m = /^\/(?:[a-z]{2}\/)?fixtures\/([^/]+)\/?$/.exec(pathname);
  return m ? decodeURIComponent(m[1]!) : null;
};

/**
 * The archived-match shell (TASK-M96).
 *
 * The middleware rewrites every archived `/fixtures/<id>` to this one prerendered page, which
 * loads the match's prerendered JSON and renders the SAME `FixtureDetailView` the
 * current-season page does. Nothing here runs on the server per request: the page and the
 * JSON are both static files on the CDN.
 *
 * ⚠️ Each setup owns its AbortController and ignores an aborted result (CLAUDE.md effect
 * lifecycle rule) — React Strict Mode runs setup → cleanup → setup in development.
 */
export function ArchiveFixture() {
  const t = useTranslations("fixtures");
  const [state, setState] = useState<State>({ status: "loading" });
  /**
   * ⚠️ The VISIBLE path, and an effect dependency. Every archived match is the same rewritten
   * page, so a client navigation from one archived match to another (back/forward, an in-app
   * link) keeps this component mounted — keyed on nothing, it would keep showing the first
   * match. `usePathname` returns the URL the visitor sees, and unlike `useSearchParams` it does
   * not opt the page out of static prerendering.
   */
  const pathname = usePathname();

  useEffect(() => {
    setState({ status: "loading" });
    const id = idFromPath(pathname);
    if (id == null) {
      setState({ status: "missing" });
      return;
    }
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/archive/fixtures/${encodeURIComponent(id)}`, {
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        if (res.status === 404) {
          setState({ status: "missing" });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const detail = (await res.json()) as FixtureDetail;
        if (ac.signal.aborted) return;
        setState({ status: "ready", detail });
        // The shell's static <title> is generic; give the tab the match's own name, in the
        // same "Home 2–1 Away" form the prerendered page's metadata uses.
        const { home, away } = detail.fixture.teams;
        const { home: gh, away: ga } = detail.fixture.goals;
        const score = gh !== null && ga !== null ? `${gh}–${ga}` : t("vs");
        document.title = `${home.name} ${score} ${away.name} — PitchIQ`;
      } catch {
        if (!ac.signal.aborted) setState({ status: "error" });
      }
    })();
    return () => ac.abort();
  }, [pathname, t]);

  if (state.status === "ready") {
    return (
      <FixtureDetailView
        detail={state.detail}
        labels={{ lineups: t("tabLineups"), events: t("tabEvents"), stats: t("tabStatistics") }}
      />
    );
  }
  return (
    <div className="container-page py-6 lg:py-10" data-testid="archive-fixture-status">
      <p role="status" className="text-muted-foreground">
        {state.status === "loading"
          ? t("archiveLoading")
          : state.status === "missing"
            ? t("fixtureNotFound")
            : t("archiveError")}
      </p>
    </div>
  );
}
