import { StrictMode } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, afterEach, expect, it, vi } from "vitest";
import { loadClassicData } from "@/features/game/adapter/classic-data";
import type { ClassicData } from "@/features/game/domain/classic-data";
import { classicTeams } from "@/features/game/view/classic-session";
import { renderWithIntl } from "./_helpers/intl";
const storage = vi.hoisted(() => ({
  loadClassicSave: vi.fn(),
  saveClassic: vi.fn(),
  clearClassic: vi.fn(),
}));
vi.mock("@/features/game/storage/classic-slot", () => storage);
import { ClassicSeason } from "@/features/game/components/ClassicSeason";
let data: ClassicData;
beforeAll(async () => {
  data = (await loadClassicData(2003))!;
});
afterEach(() => vi.unstubAllGlobals());
it("blocks play and further rotation after a save failure, then retries the selected XI", async () => {
  const own = classicTeams(data, 42, "4-4-2 Flat")[data.clubIds.indexOf(42)];
  const saved = {
    version: 1,
    season: 2003,
    clubId: 42,
    formation: "4-4-2 Flat",
    archiveKey: data.archiveKey,
    seed: 12345,
    cardIds: own.players.map((p) => p.cardId),
    results: [],
  };
  storage.loadClassicSave.mockResolvedValue(saved);
  storage.saveClassic.mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
  const user = userEvent.setup();
  renderWithIntl(
    <StrictMode>
      <ClassicSeason seasons={[2003]} />
    </StrictMode>,
  );
  await screen.findByRole("button", { name: "Play fixture" });
  await user.click(screen.getByText("Your XI", { selector: "summary" }));
  const slot = screen.getByRole("combobox", { name: /^Position 2 / }) as HTMLSelectElement;
  const replacement = Array.from(slot.options).find((o) => o.value !== slot.value);
  expect(replacement).toBeDefined();
  await user.selectOptions(slot, replacement!.value);
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Play fixture" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Sim fixture" })).toBeDisabled();
  expect(slot).toBeDisabled();
  const cards: string[] = [...saved.cardIds];
  cards[1] = replacement!.value;
  expect(storage.saveClassic).toHaveBeenCalledWith({ ...saved, cardIds: cards });
  await user.click(screen.getByRole("button", { name: /Retry/i }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(slot).toHaveValue(replacement!.value);
  expect(screen.getByRole("button", { name: "Play fixture" })).toBeEnabled();
  expect(storage.saveClassic).toHaveBeenCalledTimes(2);
  expect(storage.saveClassic).toHaveBeenLastCalledWith({ ...saved, cardIds: cards });
});
