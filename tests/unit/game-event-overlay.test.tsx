import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { OverlayEvent } from "@/features/game/components/EventOverlay";
import { renderWithIntl } from "./_helpers/intl";

const { EventOverlay } = await import("@/features/game/components/EventOverlay");

const goal: OverlayEvent = {
  kind: "goal",
  name: "Rodri",
  number: 16,
  // ⚠️ The REAL `CommentaryRef` shape — `{ key, values }`, with the formatted variants
  // derived by `commentaryArgs`. A flat object type-checks nowhere and throws at render.
  commentary: {
    key: "commentary.goalAnon",
    values: { minute: 67, homeScore: 2, awayScore: 1 },
  },
};

describe("EventOverlay", () => {
  it("renders the moment's label, shirt number and name", () => {
    renderWithIntl(<EventOverlay event={goal} />);
    expect(screen.getByText("GOAL")).toBeTruthy();
    expect(screen.getByText("16")).toBeTruthy();
    expect(screen.getByText(/Rodri/)).toBeTruthy();
  });

  it("⚠️ emits all four TASK-1809 cascade classes", () => {
    // The CSS half of this animation is asserted in game-event-animation.test.ts. That
    // test passes even if these class names are removed from the component, so the
    // cascade would silently stop while the stylesheet still looked correct. This is the
    // other half of the pair.
    const { container } = renderWithIntl(<EventOverlay event={goal} />);
    for (const cls of [
      "game-event-overlay",
      "game-event-icon",
      "game-event-kind",
      "game-event-who",
      "game-event-line",
    ]) {
      expect(container.querySelector(`.${cls}`), `${cls} is not rendered`).not.toBeNull();
    }
  });

  it("⚠️ publishes the accent as a custom property, not only as a border colour", () => {
    // `game-event-glow` reads var(--game-event-accent). A keyframe cannot see an inline
    // `borderColor`, so without this the glow silently falls back to its default and every
    // event kind glows the same colour.
    const { container } = renderWithIntl(<EventOverlay event={goal} />);
    const card = container.querySelector<HTMLElement>(".game-event-overlay");
    expect(card).not.toBeNull();
    expect(card!.style.getPropertyValue("--game-event-accent")).toBe("#f6c000");
  });

  it("gives each event kind its own accent", () => {
    // A penalty must never be mistaken for a goal, or a substitution for a sending-off.
    const { container } = renderWithIntl(
      <EventOverlay event={{ ...goal, kind: "card", card: "red" }} />,
    );
    const card = container.querySelector<HTMLElement>(".game-event-overlay");
    expect(card!.style.getPropertyValue("--game-event-accent")).toBe("#ff4b4b");
    expect(screen.getByText("RED CARD")).toBeTruthy();
  });

  it("stays announced to assistive tech", () => {
    renderWithIntl(<EventOverlay event={goal} />);
    // The icon is decorative; the status role plus its label is what a screen reader gets.
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
