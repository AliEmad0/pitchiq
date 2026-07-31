import "server-only";

import { fixturesOgImagePath } from "@/app/api/og/fixtures-card";
import { leaderboardsOgImagePath } from "@/app/api/og/leaderboards-card";
import { managersOgImagePath } from "@/app/api/og/managers-card";
import { playersOgImagePath } from "@/app/api/og/players-card";
import { teamsOgImagePath } from "@/app/api/og/teams-card";
import { FixturesIndex } from "@/features/leagues/components/FixturesIndex";
import { LeaderboardsIndex } from "@/features/players/components/LeaderboardsIndex";
import { PlayersIndex } from "@/features/players/components/PlayersIndex";
import { ManagersIndex } from "@/features/managers/components/ManagersIndex";
import { TeamsIndex } from "@/features/teams/components/TeamsIndex";
import type { SectionSlug } from "@/features/seasons/section-slugs";

// TASK-M71b — server-side registry mapping each season-path section to its
// index component + the fields its metadata needs. Server-only (imports the
// Server Components + OG helpers). The client-safe slug list lives in
// section-slugs.ts; keep both in sync (SECTION_SLUGS is the source of truth for
// which slugs exist).
type SectionEntry = {
  Index: (props: { season: number; locale: string }) => Promise<React.JSX.Element>;
  og: (season: number) => string;
  ns: string; // getTranslations namespace
  titleKey: string;
  titleNeedsSeason?: boolean; // fixtures interpolates {season} into its title
  descKey?: string; // fixtures has no meta description
  ogAltKey: string;
};

export const SECTION_REGISTRY: Record<SectionSlug, SectionEntry> = {
  teams: {
    Index: TeamsIndex,
    og: teamsOgImagePath,
    ns: "teams",
    titleKey: "clubs",
    descKey: "metaDescription",
    ogAltKey: "ogAlt",
  },
  players: {
    Index: PlayersIndex,
    og: playersOgImagePath,
    ns: "players",
    titleKey: "pageTitle",
    descKey: "metaDescription",
    ogAltKey: "ogAlt",
  },
  fixtures: {
    Index: FixturesIndex,
    og: fixturesOgImagePath,
    ns: "fixtures",
    titleKey: "metaTitle",
    titleNeedsSeason: true,
    ogAltKey: "ogAlt",
  },
  leaderboards: {
    Index: LeaderboardsIndex,
    og: leaderboardsOgImagePath,
    ns: "leaderboard",
    titleKey: "metaTitle",
    descKey: "metaDescription",
    ogAltKey: "ogAlt",
  },
  managers: {
    Index: ManagersIndex,
    og: managersOgImagePath,
    ns: "managers",
    titleKey: "pageTitle",
    descKey: "metaDescription",
    ogAltKey: "ogAlt",
  },
};
