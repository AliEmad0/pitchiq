import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithIntl } from "./_helpers/intl";

import { ManagerSeasonView } from "@/features/managers/components/ManagerSeasonView";

afterEach(() => cleanup());

// TASK-M71c — the client season swap for /managers/[id]. The initial season's
// content is server-rendered and passed in as `children`; this pins that it
// renders untouched when no swap is active.
describe("ManagerSeasonView", () => {
  it("renders the server-provided children for the initial season", () => {
    renderWithIntl(
      <ManagerSeasonView
        managerId="58"
        seasons={[2008, 2007]}
        initialSeason={2008}
        managerName="Alex Ferguson"
      >
        <div data-testid="subtree" />
      </ManagerSeasonView>,
    );
    expect(screen.getByTestId("subtree")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("2008-09");
  });
});
