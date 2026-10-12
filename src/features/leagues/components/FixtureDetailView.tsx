import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventsUnavailable } from "@/features/leagues/components/EventsUnavailable";
import { EventTimeline } from "@/features/leagues/components/EventTimeline";
import { FixtureHeader } from "@/features/leagues/components/FixtureHeader";
import { LineupUnavailable } from "@/features/leagues/components/LineupUnavailable";
import { PitchLineup } from "@/features/leagues/components/PitchLineup";
import { StatComparison } from "@/features/leagues/components/StatComparison";
import type { FixtureDetail } from "@/types/api";
import { revealProps } from "@/utils/reveal";
import { currentDataSeason, seasonFromFixtureId } from "@/utils/season";

export interface FixtureTabLabels {
  lineups: string;
  events: string;
  stats: string;
}

/**
 * The match page's body — header plus the Lineups / Events / Stats tabs.
 *
 * ⚠️ No `"use client"` and no server API, ON PURPOSE (TASK-M96). Two surfaces render it:
 * the prerendered `/fixtures/[id]` page (current season) and the client-side archive shell
 * (`/archive/fixture`, every older season). Keeping one component is what guarantees an
 * archived match looks exactly like a prerendered one. The tab labels arrive as props because
 * the page reads them with `getTranslations` and the shell with `useTranslations`.
 */
export function FixtureDetailView({
  detail,
  labels,
}: {
  detail: FixtureDetail;
  labels: FixtureTabLabels;
}) {
  // M21: the fixture's own season, carried onto player/manager links.
  const season = seasonFromFixtureId(String(detail.fixture.fixture.id)) ?? currentDataSeason();
  const hasLineups = detail.lineups.length > 0;
  const hasEvents = detail.events.length > 0;
  // Lineups is the default tab when we have them; otherwise fall back to Stats
  // (the only tab guaranteed to have content for uncovered fixtures).
  const defaultTab = hasLineups ? "lineups" : "stats";

  return (
    <div className="container-page py-6 lg:py-10">
      <FixtureHeader fixture={detail.fixture} />

      <Tabs defaultValue={defaultTab} className="mt-6">
        {/* TASK-1512 — pill tabs: rounded, the active one filled in the era accent. */}
        <TabsList className="h-auto gap-2 bg-transparent p-0">
          {(
            [
              ["lineups", labels.lineups],
              ["events", labels.events],
              ["stats", labels.stats],
            ] as const
          ).map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="ix-tab ix-glow ix-press border-border rounded-full border px-4 py-1.5 data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {/* Each panel carries a reveal (TASK-1704): Radix mounts a tab's content
            on activation, so a tab switch soft-rises the incoming panel too. */}
        <TabsContent value="lineups" className="mt-4" {...revealProps()}>
          {hasLineups ? <PitchLineup detail={detail} season={season} /> : <LineupUnavailable />}
        </TabsContent>
        <TabsContent value="events" className="mt-4" {...revealProps()}>
          {hasEvents ? (
            <EventTimeline
              events={detail.events}
              homeId={detail.fixture.teams.home.id}
              season={season}
            />
          ) : (
            <EventsUnavailable />
          )}
        </TabsContent>
        <TabsContent value="stats" className="mt-4" {...revealProps()}>
          <StatComparison statistics={detail.statistics} fixtureTeams={detail.fixture.teams} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
