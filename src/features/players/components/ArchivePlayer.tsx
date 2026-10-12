"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import type { ClubLogosFile } from "@/data/schemas";
import type { PlayerArchive } from "@/features/players/archive-types";
import { MarketValueBlock } from "@/features/players/components/MarketValueBlock";
import { PlayerCareerRecord } from "@/features/players/components/PlayerCareerRecord";
import { PlayerHero } from "@/features/players/components/PlayerHero";
import { PlayerSeasonBody, PlayerSeasonView } from "@/features/players/components/PlayerSeasonView";

type State =
  | { status: "loading" }
  | { status: "ready"; archive: PlayerArchive; clubLogos: ClubLogosFile | null }
  | { status: "missing" }
  | { status: "error" };

/** The player id is the last path segment — the middleware rewrite keeps the visitor's URL. */
const idFromPath = (pathname: string): string | null => {
  const m = /^\/(?:[a-z]{2}\/)?players\/(\d+)\/?$/.exec(pathname);
  return m ? m[1]! : null;
};

/**
 * The archived-player shell (TASK-M96 PR B).
 *
 * The middleware rewrites every archived `/players/<id>` here. It loads the player's
 * prerendered JSON (every season, baked at build time) plus the shared crest map, and renders
 * the SAME `PlayerSeasonView` / hero / market-value / career-record components a current player
 * gets — with `preloaded`, so changing season never calls a request-time API. Nothing here
 * runs on the server per request.
 *
 * ⚠️ Keyed on the VISIBLE path (`usePathname`): every archived player is the same rewritten
 * page, so a client navigation from one to another keeps this mounted (the TASK-M96 PR A
 * lesson). Each effect setup owns its AbortController (CLAUDE.md effect lifecycle rule).
 */
export function ArchivePlayer() {
  const t = useTranslations("players");
  const tNotFound = useTranslations("notFound");
  const pathname = usePathname();
  const [state, setState] = useState<State>({ status: "loading" });

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
        const [res, logosRes] = await Promise.all([
          fetch(`/api/archive/players/${id}`, { signal: ac.signal }),
          fetch("/api/archive/club-logos", { signal: ac.signal }),
        ]);
        if (ac.signal.aborted) return;
        if (res.status === 404) {
          setState({ status: "missing" });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const archive = (await res.json()) as PlayerArchive;
        const clubLogos = logosRes.ok ? ((await logosRes.json()) as ClubLogosFile) : null;
        if (ac.signal.aborted) return;
        setState({ status: "ready", archive, clubLogos });
        document.title = `${archive.name} — PitchIQ`;
      } catch {
        if (!ac.signal.aborted) setState({ status: "error" });
      }
    })();
    return () => ac.abort();
  }, [pathname]);

  if (state.status !== "ready") {
    return (
      <main className="container-page py-6 lg:py-10" data-testid="archive-player-status">
        <p role="status" className="text-muted-foreground">
          {state.status === "loading"
            ? t("archiveLoading")
            : state.status === "missing"
              ? tNotFound("playerTitle")
              : t("archiveError")}
        </p>
      </main>
    );
  }

  const { archive, clubLogos } = state;
  const initial = archive.bySeason[String(archive.initialSeason)];
  return (
    <PlayerSeasonView
      key={archive.id}
      playerId={archive.id}
      seasons={archive.seasons}
      initialSeason={archive.initialSeason}
      displayName={archive.name}
      clubLogos={clubLogos}
      preloaded={archive.bySeason}
      hero={
        initial?.profile && <PlayerHero player={initial.profile} season={archive.initialSeason} />
      }
      careerBlock={
        <>
          {archive.marketValue && <MarketValueBlock seasons={archive.marketValue} />}
          <PlayerCareerRecord record={archive.career} />
        </>
      }
    >
      {initial?.profile && (
        <PlayerSeasonBody
          profile={initial.profile}
          facts={initial.facts}
          season={archive.initialSeason}
          clubLogos={clubLogos}
        />
      )}
    </PlayerSeasonView>
  );
}
