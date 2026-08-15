import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/utils/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// BOTH not-found.tsx and error.tsx are Client Components using useTranslations,
// so both render under the intl provider via renderWithIntl.
//
// not-found.tsx used to be a Server Component calling getTranslations — that was
// TASK-M89: a boundary file gets no `params`, so it can never call
// setRequestLocale(), and the server call resolved next-intl to defaultLocale and
// poisoned the whole prerendered segment (every /ar detail page shipped the
// English catalog). There is NO loading.tsx either: TASK-M72 removed every
// loading boundary above notFound()-throwing segments — a Suspense boundary lets
// Next flush the 200 shell before the page runs, which made every unknown URL a
// soft 404. Same family: a paramless boundary doing work the segment depends on.
vi.mock("next-intl/server", () => import("./_helpers/intl-server"));

import { logger } from "@/utils/logger";

import GlobalError from "@/app/[locale]/error";
import NotFound from "@/app/[locale]/not-found";

import { renderWithIntl } from "./_helpers/intl";

const mockedError = vi.mocked(logger.error);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockedError.mockClear();
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
  it("renders the 404 title and a back-to-dashboard link pointing at /", () => {
    renderWithIntl(<NotFound />);

    expect(screen.getByText(/page not found/i)).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /back to dashboard/i });
    expect(link).toHaveAttribute("href", "/");
  });
});
