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
});
