import "fake-indexeddb/auto";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadClassicData } from "@/features/game/adapter/classic-data";
import { cleanName, CRESTS, TUTORIAL } from "@/features/game/domain/coach";
import { dailyPersonality, DAILY_PERSONALITY_FROM } from "@/features/game/domain/daily";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";
import { defaultAnswer } from "@/features/game/domain/match-decisions";
import { drive, runMatch } from "@/features/game/domain/simulate";
import { SCENARIOS } from "@/features/game/domain/what-if";
import { idbPut } from "@/features/game/storage/idb";
import { loadProfile, saveProfile } from "@/features/game/storage/profile-slot";
import { buildBoostedSession } from "@/features/game/view/what-if-session";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
const { Onboarding } = await import("@/features/game/components/Onboarding");
const { CoachBanner } = await import("@/features/game/components/CoachBanner");

/** TASK-1827 — the first run: identity, the tutorial rescue, the hook. */
const card = {
  id: TUTORIAL.scenarioId,
  home: { id: 20, name: "Southampton" },
  away: { id: 10, name: "Liverpool" },
};

beforeEach(() => {
  indexedDB.deleteDatabase("pitchiq-game");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("nope", { status: 503 })),
  );
});

describe("the tutorial match", () => {
  it("⛔ the fixed seed makes the first decision matter: Overload wins it, Hold loses it", async () => {
    const s = SCENARIOS.find((x) => x.id === TUTORIAL.scenarioId)!;
    expect(s.startMinute).toBeGreaterThanOrEqual(60); // a rescue short enough for 30 seconds
    const data = (await loadClassicData(s.season))!;
    const play = (choice: "overload" | "hold") => {
      const { setup } = buildBoostedSession(s, data, TUTORIAL.seed)!;
      return drive(runMatch(setup), (q: MatchDecision): DecisionAnswer => {
        if (q.kind === "response" && q.side === s.side) {
          return { kind: "response", minute: q.minute, side: q.side, choice };
        }
        const a = defaultAnswer(q);
        return a.kind === "sub-offer" ? { ...a, reason: undefined } : a;
      }).score;
    };
    const won = play("overload");
    const lost = play("hold");
    expect(won.home).toBeGreaterThan(won.away);
    expect(lost.home).toBeLessThan(lost.away);
  }, 120_000);
});

describe("coach identity", () => {
  it("cleans names, and every crest id is unique", () => {
    expect(cleanName("  Ali   Emad  ")).toBe("Ali Emad");
    expect(cleanName("x".repeat(40))).toHaveLength(20);
    expect(new Set(CRESTS.map((c) => c.id)).size).toBe(CRESTS.length);
  });

  it("round-trips a profile, and treats a malformed one as a first visit", async () => {
    const p = { name: "Ali", crest: "wolf", createdAt: "2026-10-21T00:00:00Z", tutorialDone: true };
    await saveProfile(p);
    expect(await loadProfile()).toEqual(p);
    await idbPut("profile", "me", { name: "", crest: "nope" });
    expect(await loadProfile()).toBeNull();
  });
});

describe("the first run", () => {
  it("Skip saves a coach with the default name, so the gate stops offering the tutorial", async () => {
    renderWithIntl(<Onboarding card={card} />);
    await userEvent.click(await screen.findByTestId("ob-skip"));
    await waitFor(async () => expect(await loadProfile()).not.toBeNull());
    expect((await loadProfile())!.tutorialDone).toBe(false);
  });

  it("a name and a crest, then Take charge opens the briefed rescue", async () => {
    renderWithIntl(<Onboarding card={card} />);
    await userEvent.type(screen.getByLabelText("Coach name"), "Ali");
    await userEvent.click(screen.getByRole("radio", { name: "Wolf" }));
    await userEvent.click(screen.getByTestId("ob-start"));
    expect(await screen.findByTestId("ob-match")).toHaveTextContent(/Ali, it.s 26 August 2000/);
    expect((await loadProfile())!).toMatchObject({ name: "Ali", crest: "wolf" });
  });
});

describe("the default name (found live, 2026-10-21)", () => {
  it('⛔ never reads "Coach Coach": the name stands alone in the brief', async () => {
    renderWithIntl(<Onboarding card={card} />);
    await userEvent.click(screen.getByTestId("ob-start"));
    const brief = await screen.findByTestId("ob-match");
    expect(brief).toHaveTextContent(/^Coach, it.s 26 August 2000/);
    expect(brief.textContent).not.toMatch(/Coach Coach/);
  });
});

describe("the gate banner", () => {
  it("offers the rescue to a first-time visitor and greets a returning coach", async () => {
    const first = renderWithIntl(<CoachBanner />);
    expect(await screen.findByTestId("coach-banner-new")).toHaveAttribute("href", "/game/start");
    first.unmount();
    await saveProfile({ name: "Ali", crest: "star", createdAt: "x", tutorialDone: true });
    renderWithIntl(<CoachBanner />);
    expect(await screen.findByTestId("coach-banner")).toHaveTextContent("Welcome back, Ali");
  });
});

describe("the daily's personality date", () => {
  it("⛔ is derived from the day, so every stored day replays under its own rule", () => {
    expect(dailyPersonality("2026-10-21")).toBe(false);
    expect(dailyPersonality(DAILY_PERSONALITY_FROM)).toBe(true);
    expect(dailyPersonality("2027-01-01")).toBe(true);
  });
});
