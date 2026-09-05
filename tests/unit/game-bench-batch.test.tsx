import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { BenchDialog } from "@/features/game/components/BenchDialog";
import { renderWithIntl } from "./_helpers/intl";
import { matchSetup } from "./_helpers/match-setup";
vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
vi.mock("@/features/game/components/PlayerCard", () => ({ PlayerCard: () => null }));
it("queues distinct changes and submits one atomic batch for one stoppage", async () => {
  const user = userEvent.setup();
  const confirm = vi.fn();
  const setup = matchSetup(1);
  renderWithIntl(
    <BenchDialog
      legalOff={setup.home.players}
      legalOn={setup.home.bench!}
      maxChanges={2}
      captainId={null}
      onConfirm={confirm}
      onClose={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Take H1 off" }));
  await user.click(screen.getByRole("button", { name: "Bring HB1 on" }));
  await user.click(screen.getByRole("button", { name: "Add another change" }));
  expect(confirm).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Take H1 off" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Bring HB1 on" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Take H2 off" }));
  await user.click(screen.getByRole("button", { name: "Bring HB2 on" }));
  expect(screen.getByRole("button", { name: "Add another change" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Make the change" }));
  expect(confirm).toHaveBeenCalledExactlyOnceWith(101, 201, [{ off: 102, on: 202 }]);
});
it("preserves the single-change dialog for existing modes", () => {
  const setup = matchSetup(1);
  renderWithIntl(
    <BenchDialog
      legalOff={setup.home.players}
      legalOn={setup.home.bench!}
      captainId={null}
      onConfirm={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: "Add another change" })).not.toBeInTheDocument();
});
