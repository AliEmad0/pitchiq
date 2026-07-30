import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithIntl } from "./_helpers/intl";

import { TeamSeasonView } from "@/features/teams/components/TeamSeasonView";

afterEach(() => cleanup());

// TASK-M71c — the client season swap for /teams/[id]. The initial season's
// content is server-rendered and passed in as `hero` + `children` slots; this
// pins that both render untouched when no swap is active.
describe("TeamSeasonView", () => {
  it("renders the server-provided hero + children for the initial season", () => {
    renderWithIntl(
      <TeamSeasonView
        teamId={42}
        seasons={[2025, 2024]}
        initialSeason={2025}
        teamName="Arsenal"
        hero={<div data-testid="hero" />}
      >
        <div data-testid="subtree" />
      </TeamSeasonView>,
    );
    expect(screen.getByTestId("hero")).toBeInTheDocument();
    expect(screen.getByTestId("subtree")).toBeInTheDocument();
    // The season control renders with the initial season selected.
    expect(screen.getByRole("combobox")).toHaveTextContent("2025-26");
  });
});
