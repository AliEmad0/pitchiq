import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/data/loaders", () => ({
  loadClubLogos: vi.fn(async () => null),
  loadManagers: vi.fn(),
  loadManagerBios: vi.fn(),
  loadTeams: vi.fn(),
  loadManagerEnrichment: vi.fn(async () => null),
}));

import {
  loadManagers,
  loadManagerBios,
  loadTeams,
  loadManagerEnrichment,
} from "../../src/data/loaders";
import { getSeasonManagers } from "../../src/features/managers/managers-index.api";

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

describe("getSeasonManagers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("joins bio + team and sorts by points", async () => {
    mock(loadManagers).mockResolvedValue({
      "2009": {
        "33": [
          {
            id: "58",
            name: "Alex Ferguson",
            matches: 38,
            win: 27,
            draw: 4,
            loss: 7,
            gf: 86,
            ga: 28,
          },
        ],
        "34": [
          {
            id: "166",
            name: "Joe Kinnear",
            matches: 38,
            win: 7,
            draw: 13,
            loss: 18,
            gf: 40,
            ga: 59,
          },
        ],
      },
    });
    mock(loadManagerBios).mockResolvedValue({
      "58": { birthDate: "1941-12-31", dateOfDeath: null, nationalityCode: "gb" },
    });
    mock(loadTeams).mockResolvedValue([
      { id: 33, name: "Manchester United", logo: "/logos/33.png" },
      { id: 34, name: "Newcastle", logo: "/logos/34.png" },
    ]);

    const rows = await getSeasonManagers(2009);
    expect(rows).not.toBeNull();
    expect(rows!.map((r) => r.managerId)).toEqual(["58", "166"]);
    expect(rows![0]).toMatchObject({
      teamName: "Manchester United",
      teamLogo: "/logos/33.png",
      nationalityCode: "gb",
      nationality: "United Kingdom",
      photo: "58",
    });
    expect(rows![0].record.points).toBe(85);
  });

  it("uses an override photo when present", async () => {
    mock(loadManagers).mockResolvedValue({
      "2009": {
        "33": [
          { id: "58", name: "Alex Ferguson", matches: 1, win: 1, draw: 0, loss: 0, gf: 1, ga: 0 },
        ],
      },
    });
    mock(loadManagerBios).mockResolvedValue({
      "58": { birthDate: null, dateOfDeath: null, photo: "https://x/af.jpg" },
    });
    mock(loadTeams).mockResolvedValue([{ id: 33, name: "Man Utd", logo: "/logos/33.png" }]);
    const rows = await getSeasonManagers(2009);
    expect(rows![0].photo).toBe("https://x/af.jpg");
  });

  it("returns null when the season has no manager data", async () => {
    mock(loadManagers).mockResolvedValue({ "2009": {} });
    mock(loadManagerBios).mockResolvedValue({});
    mock(loadTeams).mockResolvedValue([]);
    expect(await getSeasonManagers(1999)).toBeNull();
  });

  // TASK-M87 — the crawled portrait rides alongside `photo`, never replacing it,
  // so `<PlayerImage>` reaches it only after the PL-CDN candidates 404.
  describe("crawled portrait fallback (TASK-M87)", () => {
    const oneManager = () => {
      mock(loadManagers).mockResolvedValue({
        "2024": {
          "31": [
            {
              id: "44410",
              name: "Oliver Glasner",
              matches: 1,
              win: 1,
              draw: 0,
              loss: 0,
              gf: 1,
              ga: 0,
            },
          ],
        },
      });
      mock(loadTeams).mockResolvedValue([
        { id: 31, name: "Crystal Palace", logo: "/logos/31.png" },
      ]);
    };

    it("exposes the enrichment portrait as photoFallback, leaving photo as the id", async () => {
      oneManager();
      mock(loadManagerBios).mockResolvedValue({});
      mock(loadManagerEnrichment).mockResolvedValue({
        "44410": { photo: "https://img.a.transfermarkt.technology/p/22891.jpg" },
      });
      const rows = await getSeasonManagers(2024);
      expect(rows![0].photo).toBe("44410");
      expect(rows![0].photoFallback).toBe("https://img.a.transfermarkt.technology/p/22891.jpg");
    });

    it("leaves photoFallback null when the crawl banked nothing", async () => {
      oneManager();
      mock(loadManagerBios).mockResolvedValue({});
      mock(loadManagerEnrichment).mockResolvedValue({ "44410": { photo: null } });
      const rows = await getSeasonManagers(2024);
      expect(rows![0].photoFallback).toBeNull();
    });

    it("keeps the owner override as photo even when a crawled portrait exists", async () => {
      // 53250 carried Fernando Velasco's picture — the override must stay on top.
      oneManager();
      mock(loadManagerBios).mockResolvedValue({ "44410": { photo: "https://override/ok.jpg" } });
      mock(loadManagerEnrichment).mockResolvedValue({
        "44410": { photo: "https://crawl/wrong.jpg" },
      });
      const rows = await getSeasonManagers(2024);
      expect(rows![0].photo).toBe("https://override/ok.jpg");
    });
  });
});
