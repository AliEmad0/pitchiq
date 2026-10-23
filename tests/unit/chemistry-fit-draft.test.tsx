import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
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
const mates: PoolCard[] = ROLES.filter((role) => role !== "RB").flatMap((role, r) =>
  Array.from({ length: 16 }, (_, i) => ({
    cardId: makeCardId(r * 100 + i, 2004),
    playerId: r * 100 + i,
    season: 2004,
    name: `${role}-${i}`,
    role,
    altRoles: (role === "CB" ? ["RB"] : []) as PlayerRole[],
    foot: null,
    height: null,
    provenance: null,
    ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 70 },
    club: "Arsenal",
    teamId: 7,
    nationalityCode: "fr",
  })),
);

/**
 * ⛔ READ OFF THE SHIPPED PACK, never restated — the #201 lesson. `lockPicks`/`confirm`
 * decide what the round does, and a fixture contradicting the pack proves nothing about it.
 */
const DRAFT = CHEMISTRY_PACK.draft!;

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

/**
 * TASK-1824 — role fit on the draft surface. The pool has NO right-back, so the RB slot can only
 * be filled by a centre-back covering it: the one man out of position, by construction.
 */
describe("role fit on the draft", () => {
  it("⭐ a man out of position wears a red mark and the meter warns what he costs", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={mates} draft={DRAFT} chemistry scoreChemistry />);
    await lock(user);
    expect(screen.queryByTestId("chem-off-warn")).toBeNull();
    await draftAll(user);
    const marks = screen.getAllByTestId("chem-off");
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent("CB");
    expect(screen.getByTestId("chem-off-warn")).toHaveTextContent(
      /1 player is out of position — −8 chemistry/,
    );
    // An all-teammate XI scores 100 on links; the one misplaced man costs eight.
    expect(screen.getByTestId("chem-meter")).toHaveTextContent("92");
  });

  it("⭐ the hand says which candidate would be out of position, and shows the cost as a LOSS", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={mates} draft={DRAFT} chemistry scoreChemistry />);
    await lock(user);
    await draftAll(user);
    // Re-open the right-back's hand: every candidate there is a CB covering.
    const rb = screen
      .getAllByRole("button")
      .find(
        (b) => b.classList.contains("pd-spot") && /RB/.test(b.getAttribute("aria-label") ?? ""),
      )!;
    await user.click(rb);
    const veil = screen.getByTestId("pd-veil");
    const tags = within(veil).getAllByTestId("chem-off-tag");
    expect(tags.length).toBeGreaterThan(0);
    expect(tags[0]).toHaveTextContent("Out of position at RB");
  });

  it("⛔ THE CONTROL — without the flag there is no mark and no warning", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={mates} draft={DRAFT} />);
    await lock(user);
    await draftAll(user);
    expect(screen.queryByTestId("chem-off")).toBeNull();
    expect(screen.queryByTestId("chem-off-warn")).toBeNull();
  });
});

/**
 * TASK-1824 glow — the owner's pick, #15 Halo Rings + #18 Shockwave Warning. Two halves, as the
 * key-event overlay taught (CLAUDE.md): the component must render the layers, and the CSS must
 * animate and gate them. Either half alone stays green with the other deleted.
 */
describe("the chemistry glow", () => {
  it("⭐ a placement flares its new links and rings the neighbours it linked to", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={mates} draft={DRAFT} chemistry scoreChemistry />);
    await lock(user);
    expect(screen.queryAllByTestId("chem-halo")).toHaveLength(0);
    await draftAll(user);
    // The last placement lit at least one teammate link and ringed its far end.
    const lit = screen.getAllByTestId("chem-halo").filter((h) => h.hasAttribute("data-lit"));
    expect(lit.length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("chem-ring").length).toBe(lit.length);
  });

  it("⭐ a man placed out of position sends the shockwave", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={mates} draft={DRAFT} chemistry scoreChemistry />);
    await lock(user);
    await draftAll(user);
    // Re-place the right-back: every card there is a CB covering, so this one is off.
    const rb = screen
      .getAllByRole("button")
      .find(
        (b) => b.classList.contains("pd-spot") && /RB/.test(b.getAttribute("aria-label") ?? ""),
      )!;
    await user.click(rb);
    const veil = screen.getByTestId("pd-veil");
    const other = within(veil)
      .getAllByTestId("pd-candidate")
      .find((c) => !within(c).queryByTestId("pd-current-mark"))!;
    await user.click(within(other).getByRole("button", { name: /^Choose / }));
    expect(screen.getByTestId("chem-wave")).toBeInTheDocument();
  });

  it("⛔ THE CONTROL — no chemistry, no glow layers at all", async () => {
    const user = userEvent.setup();
    render(<GamePlay pool={mates} draft={DRAFT} />);
    await lock(user);
    await draftAll(user);
    for (const id of ["chem-halo", "chem-ring", "chem-wave"]) {
      expect(screen.queryAllByTestId(id)).toHaveLength(0);
    }
  });
});

describe("the chemistry glow — CSS", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync("src/app/globals.css", "utf8");
  const rule = (sel: string) => {
    const at = css.indexOf(`${sel} {`);
    return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
  };

  it("animates every layer — the RULE, not merely the selector", () => {
    for (const sel of [
      ".chem-halo-lit",
      ".chem-ring",
      ".chem-wave",
      ".chem-meter-down",
      ".chem-off",
    ]) {
      expect(rule(sel), sel).toMatch(/animation:\s*chem-/);
    }
  });

  it("⛔ nothing on the chemistry surface loops forever", () => {
    expect(css).not.toMatch(/animation:\s*chem-[^;]*infinite/);
  });

  it("⛔ one reduced-motion gate stops every layer", () => {
    const gate = css.slice(css.indexOf(".chem-halo-lit,\n  .chem-ring,"));
    const block = gate.slice(0, gate.indexOf("}"));
    for (const sel of [".chem-ring", ".chem-wave", ".chem-meter-down", ".chem-off"]) {
      expect(block).toContain(sel);
    }
    expect(block).toContain("animation: none");
    // …and that block really sits inside a reduce media query.
    const before = css.slice(0, css.indexOf(".chem-halo-lit,\n  .chem-ring,"));
    expect(before.lastIndexOf("@media (prefers-reduced-motion: reduce)")).toBeGreaterThan(
      before.lastIndexOf("\n}\n@media (prefers-reduced-motion: no-preference)"),
    );
  });
});
