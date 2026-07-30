import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/utils/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// not-found.tsx is a Server Component that localizes via getTranslations
// (TASK-1603); loading.tsx and error.tsx are Client Components using
// useTranslations (rendered under the intl provider via renderWithIntl) —
// loading.tsx became one in TASK-M71a: as a server component it streamed
// before the page with no request context and poisoned next-intl's config
// cache with the "en" fallback on force-static /ar renders.
vi.mock("next-intl/server", () => import("./_helpers/intl-server"));

import { logger } from "@/utils/logger";

import Loading from "@/app/[locale]/loading";
import GlobalError from "@/app/[locale]/error";
import NotFound from "@/app/[locale]/not-found";

import { renderWithIntl } from "./_helpers/intl";

const mockedError = vi.mocked(logger.error);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockedError.mockClear();
});

describe("loading.tsx", () => {
  it("renders a live status region with a loading indicator and label", () => {
    renderWithIntl(<Loading />);

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute("aria-live", "polite");
    // TASK-1503 "VAR review" theme: the loading label reads as a VAR check.
    expect(status).toHaveTextContent(/VAR check in progress/i);
  });
});

describe("error.tsx", () => {
  it("renders the failure title and a Try again action", () => {
    renderWithIntl(<GlobalError error={new Error("boom")} reset={vi.fn()} />);

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("logs the error via logger.error with the canonical route.error key", () => {
    const err = Object.assign(new Error("kaboom"), { digest: "abc123" });
    renderWithIntl(<GlobalError error={err} reset={vi.fn()} />);

    expect(mockedError).toHaveBeenCalledExactlyOnceWith(
      "route.error",
      expect.objectContaining({
        name: "Error",
        message: "kaboom",
        digest: "abc123",
        stack: expect.any(String),
      }),
    );
  });

  it("invokes the reset prop when the Try again button is clicked", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<GlobalError error={new Error("boom")} reset={reset} />);

    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(reset).toHaveBeenCalledOnce();
  });

  it("offers a back-to-dashboard link as an escape hatch", () => {
    renderWithIntl(<GlobalError error={new Error("boom")} reset={vi.fn()} />);

    const link = screen.getByRole("link", { name: /back to dashboard/i });
    expect(link).toHaveAttribute("href", "/");
  });
});

describe("not-found.tsx", () => {
  it("renders the 404 title and a back-to-dashboard link pointing at /", async () => {
    render(await NotFound());

    expect(screen.getByText(/page not found/i)).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /back to dashboard/i });
    expect(link).toHaveAttribute("href", "/");
  });
});
