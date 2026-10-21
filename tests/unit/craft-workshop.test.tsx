import "fake-indexeddb/auto";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CraftWorkshop } from "@/features/game/components/CraftWorkshop";
import { loadBadges } from "@/features/game/storage/badge-slot";
import { addCards, loadAlbum } from "@/features/game/storage/trophy-slot";
import { renderWithIntl } from "./_helpers/intl";

/** TASK-1829 — the workshop under the album. */
const henry = {
  cardId: "1@2003",
  teamId: 1,
  name: "Thierry Henry",
  role: "CF",
  season: 2003,
  ovr: 95,
};

beforeEach(() => {
  indexedDB.deleteDatabase("pitchiq-game");
});

describe("CraftWorkshop", () => {
  it("says where badges play, and offers nothing without enough duplicates", () => {
    renderWithIntl(
      <CraftWorkshop
        album={[{ ...henry, firstDay: "d", count: 3 }]}
        badges={[]}
        onCrafted={vi.fn()}
      />,
    );
    expect(screen.getByTestId("craft-workshop")).toHaveTextContent(
      /Weekly Ladder and the Mystery Market/,
    );
    expect(screen.queryAllByTestId("cw-ready")).toHaveLength(0);
  });

  it("mints a badge from four collections, and reports it", async () => {
    for (let i = 0; i < 4; i++) await addCards([henry], "2026-10-21");
    const onCrafted = vi.fn();
    renderWithIntl(<CraftWorkshop album={await loadAlbum()} badges={[]} onCrafted={onCrafted} />);
    expect(screen.getByTestId("cw-ready")).toHaveTextContent("Thierry Henry");
    await userEvent.click(screen.getByRole("button", { name: "Engine" }));
    await waitFor(() => expect(onCrafted).toHaveBeenCalled());
    expect((await loadBadges())[0]).toMatchObject({ cardId: "1@2003", trait: "engine" });
  });

  it("lists crafted badges and stops offering that card", async () => {
    renderWithIntl(
      <CraftWorkshop
        album={[{ ...henry, firstDay: "d", count: 9 }]}
        badges={[{ cardId: "1@2003", trait: "rock", craftedAt: "t" }]}
        onCrafted={vi.fn()}
      />,
    );
    expect(screen.queryAllByTestId("cw-ready")).toHaveLength(0);
    expect(screen.getByTestId("cw-crafted")).toHaveTextContent(/Thierry Henry.*Rock/);
  });
});
