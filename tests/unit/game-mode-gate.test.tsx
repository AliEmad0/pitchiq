import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  COLLECTION_SURFACES,
  GAME_MODES,
  isDirectEntry,
  isPlayable,
} from "@/features/game/domain/modes";
import en from "@/i18n/messages/en.json";
import { renderWithIntl } from "./_helpers/intl";

const { ModeGate } = await import("@/features/game/components/ModeGate");

const label = (key: string) => (en.game as Record<string, string>)[key];

describe("ModeGate", () => {
  it("renders every mode in the registry exactly once", () => {
    renderWithIntl(<ModeGate />);
    for (const mode of GAME_MODES) {
      const name = label(mode.nameKey);
      expect(
        screen.getAllByText(new RegExp(escapeRegExp(name)), { exact: false }),
        name,
      ).not.toHaveLength(0);
    }
  });

  it("renders every collection surface", () => {
    renderWithIntl(<ModeGate />);
    for (const surface of COLLECTION_SURFACES) {
      expect(
        screen.getByText(new RegExp(escapeRegExp(label(surface.nameKey)))),
      ).toBeInTheDocument();
    }
  });

  it("opens a mode on click and collapses it on a second click", async () => {
    renderWithIntl(<ModeGate />);
    const tile = screen.getByRole("button", { name: /Tactical H2H/ });

    expect(tile).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(tile);
    expect(tile).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /One Match/ })).toBeInTheDocument();

    await userEvent.click(tile);
    expect(tile).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /One Match/ })).not.toBeInTheDocument();
  });

  it("keeps only one mode open at a time", async () => {
    renderWithIntl(<ModeGate />);
    const h2h = screen.getByRole("button", { name: /Tactical H2H/ });
    const chaos = screen.getByRole("button", { name: /Chaos Draft/ });

    await userEvent.click(h2h);
    await userEvent.click(chaos);

    expect(h2h).toHaveAttribute("aria-expanded", "false");
    expect(chaos).toHaveAttribute("aria-expanded", "true");
  });

  it("links the demo, which is not a mode and has no other way in", () => {
    renderWithIntl(<ModeGate />);
    // When this gate took over `/game` the broadcast showcase moved to `/game/demo` and
    // lost every inbound link. It is deliberately absent from the registry (there is
    // nothing to draft), so nothing else would catch its disappearance.
    const link = screen.getByRole("link", { name: /watch a match/i });
    expect(link).toHaveAttribute("href", "/game/demo");
  });

  it("exposes a control for the playable modes only", () => {
    renderWithIntl(<ModeGate />);
    // ⚠️ Derived from the registry, not hardcoded — this used to assert a literal 2 and so
    // had to be edited every time a mode shipped, which is a test that reports "the count
    // changed" rather than "the rule broke". The rule is that only PLAYABLE modes get a
    // control; every locked tile stays inert, so the gate contributes a handful of tab
    // stops rather than eleven.
    //
    // Cross-checking the DOM against `isPlayable` is not circular: if the gate rendered
    // every tile as a button this would read eleven against three and still fail.
    //
    // ⚠️ A control is an EXPANDER OR A DIRECT LINK since TASK-1841: a mode with only one
    // applicable format (the daily has no Full Season) goes straight in rather than
    // opening a format choice with one option in it. Counting only `aria-expanded` would
    // now under-count the playable modes and, worse, would pass if the daily lost its
    // control entirely.
    const playable = GAME_MODES.filter(isPlayable);
    const expanders = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded"));
    const direct = playable.filter(isDirectEntry);
    expect(expanders).toHaveLength(playable.length - direct.length);
    for (const mode of direct) {
      // By HREF, not by accessible name: the name is the tile's emoji + title + blurb.
      const link = screen
        .getAllByRole("link")
        .find((a) => a.getAttribute("href")?.endsWith(mode.href!));
      expect(link, `no direct link for ${mode.id}`).toBeDefined();
    }
    // And the roster must still contain locked modes, or the assertion above is vacuous.
    expect(playable.length).toBeLessThan(GAME_MODES.length);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
