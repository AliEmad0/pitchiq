import { describe, expect, it, vi } from "vitest";

// TASK-M71c — the new Route Handlers (/api/teams/[id]/season-view,
// /api/managers/[id]/profile) have no [locale] segment, so getEntityNames()'s
// getLocale() fallback would silently return English there. Every fetcher the
// routes call must accept an explicit locale and thread it down — the same
// contract getPlayerProfile(id, season, locale) already honours.
vi.mock("@/features/i18n/entity-names", () => ({
  getEntityNames: vi.fn(async () => ({
    isAr: true,
    team: (_id: number | string, latin: string) => `AR:${latin}`,
    player: (_id: number | string, latin: string) => `AR:${latin}`,
    manager: (_id: number | string, latin: string) => `AR:${latin}`,
    venue: (_teamId: number | string, latin: string | null) => latin,
    city: (_teamId: number | string, latin: string | null) => latin,
    referee: (latin: string | null) => latin,
    position: (latin: string | null) => latin,
    nationality: (_code: string | null, latin: string | null) => latin,
  })),
}));

import { getEntityNames } from "@/features/i18n/entity-names";
import { getManagerProfile } from "@/features/managers/manager-profile.api";
import { getSquad, getTeam } from "@/features/teams/api";
import { getTeamManagers } from "@/features/teams/managers.api";

const mocked = vi.mocked(getEntityNames);

describe("entity fetchers thread the explicit locale to getEntityNames", () => {
  it("getTeam passes the locale override", async () => {
    mocked.mockClear();
    await getTeam(42, 2024, "ar");
    expect(mocked).toHaveBeenCalledWith("ar");
  });

  it("getSquad passes the locale override", async () => {
    mocked.mockClear();
    await getSquad(42, 2024, "ar");
    expect(mocked).toHaveBeenCalledWith("ar");
  });

  it("getTeamManagers passes the locale override", async () => {
    mocked.mockClear();
    await getTeamManagers(2024, 42, "ar");
    expect(mocked).toHaveBeenCalledWith("ar");
  });

  it("getManagerProfile passes the locale override", async () => {
    mocked.mockClear();
    // "58" = Alex Ferguson in the committed managers.json (ids are numeric strings).
    await getManagerProfile("58", 2008, "ar");
    expect(mocked).toHaveBeenCalledWith("ar");
  });

  it("RSC callers that omit the locale keep the request-context path", async () => {
    mocked.mockClear();
    await getTeam(42, 2024);
    expect(mocked).toHaveBeenCalledWith(undefined);
  });
});
