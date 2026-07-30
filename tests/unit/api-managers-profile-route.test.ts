import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/managers/manager-profile.api", () => ({
  getManagerProfile: vi.fn(async () => ({ id: "58", name: "Alex Ferguson", seasons: [2008] })),
}));

import { getManagerProfile } from "@/features/managers/manager-profile.api";
import { GET } from "@/app/api/managers/[id]/profile/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/managers/[id]/profile", () => {
  it("returns the profile for the requested season + locale", async () => {
    const res = await GET(
      new Request("http://x/api/managers/58/profile?season=2008&locale=ar"),
      params("58"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).profile.name).toBe("Alex Ferguson");
    expect(vi.mocked(getManagerProfile)).toHaveBeenCalledWith("58", 2008, "ar");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=86400");
  });

  it("404s an unknown manager", async () => {
    vi.mocked(getManagerProfile).mockResolvedValueOnce(null);
    const res = await GET(new Request("http://x/api/managers/nobody/profile"), params("nobody"));
    expect(res.status).toBe(404);
  });
});
