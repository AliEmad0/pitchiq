import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// not-found.tsx is a Server Component that localizes via getTranslations
// (TASK-1603); mock next-intl/server so `render(await TeamNotFound())` resolves
// the real English strings without a request context.
vi.mock("next-intl/server", () => import("./_helpers/intl-server"));

import TeamNotFound from "@/app/[locale]/teams/[id]/not-found";

afterEach(() => {
  cleanup();
});

// The route's loading.tsx was REMOVED in TASK-M72: its Suspense boundary let
// Next flush a 200 shell before the page's notFound() ran, so unknown team
// ids were soft 404s. The page's per-section Suspense skeletons remain.
describe("/teams/[id] not-found.tsx", () => {
  it("renders the team-specific 404 copy and two routing actions", async () => {
    render(await TeamNotFound());

    // CardTitle is a div, not a semantic heading — match by text.
    expect(screen.getByText(/Team not found/)).toBeTruthy();
    // CardDescription mentions the dataset (TASK-609 reworded from
    // "wire dataset" → "our Premier League dataset").
    expect(screen.getByText(/our Premier League dataset/i)).toBeTruthy();
    // Two link buttons: /teams index + dashboard
    const browseLink = screen.getByRole("link", { name: /Browse all clubs/ });
    expect(browseLink.getAttribute("href")).toBe("/teams");
    const dashboardLink = screen.getByRole("link", { name: /Dashboard/ });
    expect(dashboardLink.getAttribute("href")).toBe("/");
  });

  it("uses different copy from the root not-found (this is the team-scoped boundary)", async () => {
    render(await TeamNotFound());
    // Root not-found's heading is "Page not found"; team-scoped is "Team
    // not found". Assert we are NOT the root copy.
    expect(screen.queryByText("Page not found")).toBeNull();
  });
});
