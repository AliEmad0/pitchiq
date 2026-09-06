import { StrictMode } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, afterEach, expect, it, vi } from "vitest";
import { loadClassicData } from "@/features/game/adapter/classic-data";
import type { ClassicData } from "@/features/game/domain/classic-data";
import { renderWithIntl } from "./_helpers/intl";
const storage = vi.hoisted(() => ({
  loadSurvivalSave: vi.fn(),
  saveSurvival: vi.fn(),
  clearSurvival: vi.fn(),
}));
vi.mock("@/features/game/storage/survival-slot", () => storage);
import { ClassicSeason } from "@/features/game/components/ClassicSeason";
let data: ClassicData;
beforeAll(async () => {
  data = (await loadClassicData(2003))!;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});
it("survives Strict Mode, waits for the slot, and retries the exact failed campaign save", async () => {
  window.history.replaceState(null, "", "/game/classic?objective=survival");
  let finish!: (value: null) => void;
  storage.loadSurvivalSave.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  storage.saveSurvival.mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
  const user = userEvent.setup();
  renderWithIntl(
    <StrictMode>
      <ClassicSeason seasons={[2003]} />
    </StrictMode>,
  );
  await waitFor(() => expect(storage.loadSurvivalSave).toHaveBeenCalled());
  expect(storage.saveSurvival).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Start Survival" })).toBeNull();
  finish(null);
  await user.click(await screen.findByRole("button", { name: "Start Survival" }));
  await screen.findByRole("alert");
  const saved = storage.saveSurvival.mock.calls[0][0];
  expect(saved.scenario.start).toBeGreaterThan(0);
  expect(saved.results).toEqual([]);
  expect(screen.getByRole("button", { name: "Play fixture" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Sim fixture" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: /Retry/i }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(storage.saveSurvival).toHaveBeenCalledTimes(2);
  expect(storage.saveSurvival.mock.calls[1][0]).toEqual(saved);
  await user.click(screen.getByRole("button", { name: "Sim fixture" }));
  await waitFor(() => expect(storage.saveSurvival).toHaveBeenCalledTimes(3));
  expect(storage.saveSurvival.mock.calls[2][0].results.length).toBeGreaterThan(0);
});
it("blocks a failed read until retry and never overwrites an unknown campaign", async () => {
  window.history.replaceState(null, "", "/game/classic?objective=survival");
  storage.loadSurvivalSave.mockRejectedValue(new Error("unavailable"));
  const user = userEvent.setup();
  renderWithIntl(<ClassicSeason seasons={[2003]} />);
  await screen.findByRole("alert");
  expect(storage.saveSurvival).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Start Survival" })).toBeNull();
  storage.loadSurvivalSave.mockResolvedValue(null);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
  await user.click(screen.getByRole("button", { name: /Retry/i }));
  expect(await screen.findByRole("button", { name: "Start Survival" })).toBeEnabled();
});
