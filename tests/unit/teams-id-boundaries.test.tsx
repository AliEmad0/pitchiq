import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";

import TeamNotFound from "@/app/[locale]/teams/[id]/not-found";

import { renderWithIntl } from "./_helpers/intl";

afterEach(() => {
  cleanup();
});

// The route's loading.tsx was REMOVED in TASK-M72: its Suspense boundary let
// Next flush a 200 shell before the page's notFound() ran, so unknown team
// ids were soft 404s. The page's per-section Suspense skeletons remain.
//
// not-found.tsx is a CLIENT Component localizing via useTranslations, so it
// renders under the intl provider. It used to be a Server Component calling
// getTranslations, which was TASK-M89: a boundary file receives no `params`, so
// it can never call setRequestLocale(), and the server call resolved next-intl
// to defaultLocale and poisoned the whole prerendered segment — every
// /ar/teams/[id] page shipped the English catalog. Same family as the M72
// loading.tsx above: a paramless boundary doing work its segment depends on.
describe("/teams/[id] not-found.tsx", () => {
  it("renders the team-specific 404 copy and two routing actions", () => {
    renderWithIntl(<TeamNotFound />);

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

  it("uses different copy from the root not-found (this is the team-scoped boundary)", () => {
    renderWithIntl(<TeamNotFound />);
    // Root not-found's heading is "Page not found"; team-scoped is "Team
    // not found". Assert we are NOT the root copy.
    expect(screen.queryByText("Page not found")).toBeNull();
  });
});
