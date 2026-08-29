import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import { adjacentPairs } from "@/features/game/domain/pitch-adjacency";
import { CHEMISTRY_PACK } from "@/features/game/domain/rule-packs";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
vi.mock("@/features/game/storage/match-slot", () => ({
  saveMatch: vi.fn(async () => {}),
  loadMatch: vi.fn(async () => null),
  clearMatch: vi.fn(async () => {}),
}));

const { GamePlay } = await import("@/features/game/components/GamePlay");

const ROLES: PlayerRole[] = [
  "GK",
  "RB",
  "CB",
  "LB",
  "CDM",
  "CM",
  "CAM",
  "RM",
  "LM",
  "RW",
  "LW",
  "SS",
  "CF",
];

/**
 * One club, one nation, one season — so EVERY pair the coach can make is a teammate pair.
 * That makes the connector assertions deterministic whatever the deal draws.
 */
const mates: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 8 }, (_, i) => ({
    cardId: makeCardId(r * 100 + i, 2004),
    playerId: r * 100 + i,
    season: 2004,
    name: `${role}-${i}`,
    role,
    altRoles: [] as PlayerRole[],
    foot: null,
    height: null,
    provenance: null,
    ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 70 },
    club: "Arsenal",
    teamId: 7,
    nationalityCode: "fr",
  })),
);

/** Nobody shares anything: distinct club, distinct nation, distinct season. */
const strangers: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 8 }, (_, i) => ({
    ...mates[0]!,
    cardId: makeCardId(5000 + r * 100 + i, 1994 + ((r + i) % 20)),
    playerId: 5000 + r * 100 + i,
    season: 1994 + ((r + i) % 20),
    name: `X-${role}-${i}`,
    role,
    club: `Club${r * 100 + i}`,
    teamId: 5000 + r * 100 + i,
    nationalityCode: `n${r * 100 + i}`,
  })),
);

/**
 * ⛔ READ OFF THE SHIPPED PACK, never restated — the #201 lesson. `lockPicks`/`confirm`
 * decide what the round does, and a fixture contradicting the pack proves nothing about it.
 */
const DRAFT = CHEMISTRY_PACK.draft!;
const PAIRS = adjacentPairs(formationByName("4-4-2 Flat")).length;

const render = (ui: ReactElement) => renderWithIntl(<NuqsTestingAdapter>{ui}</NuqsTestingAdapter>);
const lock = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /^Lock in / }));

/** Fill every pitch slot by taking the first pickable card in each round. */
async function draftAll(user: ReturnType<typeof userEvent.setup>) {
  for (let guard = 0; guard < 14; guard++) {
    const spot = screen
      .queryAllByRole("button", { name: /empty\. Choose a player/ })
      .find((b) => b.classList.contains("pd-spot"));
    if (spot == null) return;
    await user.click(spot);
    const veil = screen.getByTestId("pd-veil");
    const pick = within(veil)
      .getAllByTestId("pd-candidate")
      .map((c) => within(c).queryByRole("button", { name: /^Choose / }))
      .find((b) => b != null && !b.hasAttribute("disabled"));
    if (pick == null) return;
    await user.click(pick);
  }
}

describe("chemistry draft", () => {
  it("⭐ draws a connector per ADJACENT PAIR, tiered by the link", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={mates} draft={DRAFT} chemistry />);
    await lock(user);

    // One connector per adjacent pair — the graph is drawn whole, so an unlinked pair is
    // visibly unlinked rather than simply absent.
    expect(screen.getAllByTestId("chem-link")).toHaveLength(PAIRS);
    // Nothing placed yet, so every one of them is at rest.
    for (const link of screen.getAllByTestId("chem-link")) {
      expect(link).toHaveAttribute("data-tier", "none");
    }

    await draftAll(user);
    // Every card shares a club AND a season, so every connector is a teammate link.
    const tiers = screen.getAllByTestId("chem-link").map((l) => l.getAttribute("data-tier"));
    expect(tiers.every((t) => t === "teammates")).toBe(true);
  });

  it("⛔ a pitch of STRANGERS draws every connector unlinked", async () => {
    // The other half of the control: the tier must reflect the cards, not merely exist.
    const user = userEvent.setup();
    render(<GamePlay pool={strangers} draft={DRAFT} chemistry />);
    await lock(user);
    await draftAll(user);
    const tiers = screen.getAllByTestId("chem-link").map((l) => l.getAttribute("data-tier"));
    expect(tiers.every((t) => t === "none")).toBe(true);
  });

  it("⭐ the meter reports the score and the tier breakdown", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={mates} draft={DRAFT} chemistry />);
    await lock(user);
    const meter = screen.getByTestId("chem-meter");
    expect(meter).toHaveTextContent("0");

    await draftAll(user);
    expect(screen.getByTestId("chem-meter")).toHaveTextContent("100");
    // ⚠️ Counts in WORDS beside the number — colour is never the only channel, and the
    // breakdown is what makes the score explicable rather than a verdict.
    expect(screen.getByTestId("chem-meter")).toHaveTextContent(new RegExp(`${PAIRS}`));
  });

  it("⛔ the connector layer never takes a click — every spot stays selectable", async () => {
    /**
     * The `::after`-eats-clicks family, third time: the pitch's own centre circle once made
     * a CM unselectable because a painted decoration sat over the buttons. The connectors
     * are a full-pitch overlay, so this is the highest-risk version of it yet.
     */
    const user = userEvent.setup();
    render(<GamePlay pool={mates} draft={DRAFT} chemistry />);
    await lock(user);
    const layer = screen.getByTestId("chem-links");
    expect(layer).toHaveStyle({ pointerEvents: "none" });

    // …and prove it behaviourally, not only by the style: a spot still opens its round.
    const spot = screen
      .getAllByRole("button", { name: /empty\. Choose a player/ })
      .find((b) => b.classList.contains("pd-spot"))!;
    await user.click(spot);
    expect(screen.getByTestId("pd-veil")).toBeInTheDocument();
  });

  it("⛔ THE CONTROL — without the prop there are no connectors and no meter", async () => {
    // Every other pack must render exactly as it did before this shipped.
    const user = userEvent.setup();
    render(<GamePlay pool={mates} draft={DRAFT} />);
    await lock(user);
    expect(screen.queryByTestId("chem-links")).toBeNull();
    expect(screen.queryAllByTestId("chem-link")).toHaveLength(0);
    expect(screen.queryByTestId("chem-meter")).toBeNull();
  });

  it("⚠️ each connector NAMES its link, so colour is not the only channel", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={mates} draft={DRAFT} chemistry />);
    await lock(user);
    await draftAll(user);
    const first = screen.getAllByTestId("chem-link")[0]!;
    expect(first.textContent).toMatch(/Teammates/);
    expect(first.textContent).toMatch(/Arsenal/);
  });
});
