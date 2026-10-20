import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { ScoutingDossier } from "@/features/game/components/ScoutingDossier";
import ar from "@/i18n/messages/ar.json";
import { renderWithIntl } from "./_helpers/intl";

/**
 * TASK-1825 — the owner's pick, gallery Style #2 "Scout's Dossier": the scout's line, the
 * opponent's style odds as bars (their usual at 60%, the rest at 8%), the coach's pick, and
 * after Kick off the reveal and who had the edge — then Walk out.
 */
const base = {
  opponentName: "Arsenal",
  tendency: "tiki-taka" as const,
  picked: "balanced" as const,
  onPick: () => {},
  revealed: null,
  onKickOff: () => {},
  onWalkOut: () => {},
};

describe("ScoutingDossier", () => {
  it("names the opponent's usual style and prices all six", () => {
    renderWithIntl(<ScoutingDossier {...base} />);
    expect(screen.getByText(/They usually play Tiki-Taka/)).toBeInTheDocument();
    const bars = screen.getAllByTestId("sd-odds");
    expect(bars).toHaveLength(6);
    const tiki = bars.find((b) => b.textContent?.includes("Tiki-Taka"))!;
    expect(tiki).toHaveTextContent("60%");
    for (const b of bars.filter((x) => x !== tiki)) expect(b).toHaveTextContent("8%");
  });

  it("picking a style marks it and reports it", async () => {
    const onPick = vi.fn();
    renderWithIntl(<ScoutingDossier {...base} onPick={onPick} />);
    expect(screen.getByRole("button", { name: /Balanced/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: /High Press/ }));
    expect(onPick).toHaveBeenCalledWith("high-press");
  });

  it("Kick off before the reveal, Walk out after it", async () => {
    const onKickOff = vi.fn();
    const onWalkOut = vi.fn();
    const { rerender } = renderWithIntl(
      <ScoutingDossier {...base} onKickOff={onKickOff} onWalkOut={onWalkOut} />,
    );
    expect(screen.queryByRole("button", { name: "Walk out" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Kick off" }));
    expect(onKickOff).toHaveBeenCalled();
    rerender(
      <ScoutingDossier
        {...base}
        onWalkOut={onWalkOut}
        revealed={{ home: "balanced", away: "tiki-taka" }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Kick off" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Walk out" }));
    expect(onWalkOut).toHaveBeenCalled();
  });

  it("the reveal says who had the edge — win, lose and none", () => {
    const { rerender } = renderWithIntl(
      <ScoutingDossier {...base} revealed={{ home: "high-press", away: "tiki-taka" }} />,
    );
    expect(screen.getByText("They played Tiki-Taka.")).toBeInTheDocument();
    expect(screen.getByText("Your High Press beats their Tiki-Taka.")).toBeInTheDocument();
    rerender(<ScoutingDossier {...base} revealed={{ home: "direct", away: "tiki-taka" }} />);
    expect(screen.getByText("Their Tiki-Taka beats your Direct.")).toBeInTheDocument();
    rerender(<ScoutingDossier {...base} revealed={{ home: "balanced", away: "counter" }} />);
    expect(screen.getByText("No edge either way.")).toBeInTheDocument();
  });

  it("speaks Arabic with Arabic digits", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <ScoutingDossier {...base} />
      </NextIntlClientProvider>,
    );
    const bars = screen.getAllByTestId("sd-odds");
    expect(bars.some((b) => b.textContent?.includes("٦٠"))).toBe(true);
    expect(bars.some((b) => /[0-9]/.test(b.textContent ?? ""))).toBe(false);
    expect(screen.getByTestId("sd-scout").textContent).toMatch(/[؀-ۿ]/);
  });
});
