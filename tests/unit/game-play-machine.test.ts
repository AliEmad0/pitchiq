import { describe, expect, it } from "vitest";
import { createPlayState, playReducer } from "@/features/game/view/play-machine";

describe("playReducer", () => {
  it("starts on the draft hub", () => {
    expect(createPlayState().phase).toBe("setup");
  });

  it("can start in a given phase, for a deep-linked route", () => {
    expect(createPlayState("preview").phase).toBe("preview");
  });

  it("setup → preview, carrying the seed the whole match replays from", () => {
    const s = playReducer(createPlayState(), { type: "confirmSquad", seed: 7 });
    expect(s.phase).toBe("preview");
    expect(s.seed).toBe(7);
  });

  it("preview → live → summary", () => {
    let s = playReducer(createPlayState(), { type: "confirmSquad", seed: 7 });
    s = playReducer(s, { type: "kickOff" });
    expect(s.phase).toBe("live");
    s = playReducer(s, { type: "fullTime" });
    expect(s.phase).toBe("summary");
  });

  it("keeps the seed across the whole session", () => {
    let s = playReducer(createPlayState(), { type: "confirmSquad", seed: 4242 });
    s = playReducer(s, { type: "kickOff" });
    s = playReducer(s, { type: "fullTime" });
    expect(s.seed).toBe(4242);
  });

  it("summary → setup starts a genuinely fresh match", () => {
    let s = playReducer(createPlayState(), { type: "confirmSquad", seed: 7 });
    s = playReducer(s, { type: "kickOff" });
    s = playReducer(s, { type: "fullTime" });
    s = playReducer(s, { type: "newMatch" });
    expect(s.phase).toBe("setup");
    // The old seed must not leak into the next match, or two runs share a result.
    expect(s.seed).toBeNull();
  });

  it("backToSetup rewinds the preview and drops the seed with it", () => {
    let s = playReducer(createPlayState(), { type: "confirmSquad", seed: 7 });
    s = playReducer(s, { type: "backToSetup" });
    expect(s.phase).toBe("setup");
    expect(s.seed).toBeNull();
  });

  it("backToSetup is refused once the match is live", () => {
    // The seed has produced events by then; rewinding would strand a half-played match.
    let s = playReducer(createPlayState(), { type: "confirmSquad", seed: 7 });
    s = playReducer(s, { type: "kickOff" });
    expect(playReducer(s, { type: "backToSetup" })).toBe(s);
  });

  it("⚠️ ignores transitions that do not belong to the current phase", () => {
    // A linear flow that ignores by default cannot be driven into a state the UI has no
    // rendering for — which is the reason this is a machine rather than a pile of
    // booleans. Each of these would otherwise strand the player on a blank screen.
    expect(playReducer(createPlayState(), { type: "fullTime" }).phase).toBe("setup");
    expect(playReducer(createPlayState(), { type: "kickOff" }).phase).toBe("setup");
    expect(playReducer(createPlayState(), { type: "newMatch" }).phase).toBe("setup");
    const live = playReducer(
      playReducer(createPlayState(), { type: "confirmSquad", seed: 1 }),
      { type: "kickOff" },
    );
    expect(playReducer(live, { type: "confirmSquad", seed: 2 })).toBe(live);
  });

  it("resume goes straight from setup to live, carrying the restored seed", () => {
    const state = playReducer(createPlayState("setup"), { type: "resume", seed: 4242 });
    expect(state.phase).toBe("live");
    expect(state.seed).toBe(4242);
  });

  it("⚠️ resume is ignored from every other phase", () => {
    // One narrow entry point. The strict reducer is what caught B1's dead preview
    // button; a resume that could fire mid-match would let a restored generator
    // overwrite a running one with no visible symptom.
    for (const phase of ["preview", "live", "summary"] as const) {
      const before = { ...createPlayState(phase), seed: 1 };
      expect(playReducer(before, { type: "resume", seed: 4242 })).toBe(before);
    }
  });
});
