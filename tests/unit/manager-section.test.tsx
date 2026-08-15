import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";

import { ManagerSection } from "@/features/teams/components/ManagerSection";
import type { ManagerProfile } from "@/features/teams/managers.api";

import { renderWithIntl } from "./_helpers/intl";

afterEach(cleanup);

const mgr = (over: Partial<ManagerProfile> = {}): ManagerProfile => ({
  id: "51070",
  name: "Bruno Lage",
  photo: "51070",
  photoFallback: null,
  birthDate: "1976-05-12",
  dateOfDeath: null,
  age: 49,
  matches: 38,
  ...over,
});

describe("ManagerSection", () => {
  it("renders nothing when there are no managers", () => {
    const { container } = renderWithIntl(<ManagerSection managers={[]} season={2022} />);
    expect(container.firstChild).toBeNull();
  });

  it("links each manager name to the profile (season-carrying)", () => {
    renderWithIntl(<ManagerSection managers={[mgr()]} season={2022} />);
    expect(screen.getByRole("link", { name: "Bruno Lage" })).toHaveAttribute(
      "href",
      "/managers/51070?season=2022",
    );
  });

  it("renders a card per manager with name + age + born, heading 'Manager' for one", () => {
    const { container } = renderWithIntl(<ManagerSection managers={[mgr()]} season={2022} />);
    expect(screen.getByRole("heading", { name: "Manager" })).toBeTruthy();
    expect(screen.getByText("Bruno Lage")).toBeTruthy();
    // PlayerAge recomputes a living manager's age to today on mount, so assert
    // the shape (not a fixed number) + the fixed DOB. textContent because the
    // "age"/number split across text nodes. The prefix is the localized
    // `teams.agePrefix` ("age ", lowercase — consistent with the squad grid) per
    // TASK-1605, so match case-insensitively.
    expect(container.textContent).toMatch(/age \d+/i);
    expect(container.textContent).toContain("Born 12/05/1976");
  });

  it("uses the plural heading + shows a 'Died' line for a deceased manager", () => {
    const { container } = renderWithIntl(
      <ManagerSection
        season={2024}
        managers={[
          mgr(),
          mgr({ id: "44439", name: "Craig Shakespeare", dateOfDeath: "2024-08-01", age: 60 }),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Managers" })).toBeTruthy();
    expect(container.textContent).toContain("Died 01/08/2024");
  });
});
