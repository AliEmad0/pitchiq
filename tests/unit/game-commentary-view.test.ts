import { describe, expect, it } from "vitest";
import type { CommentaryRef } from "@/features/game/domain/commentary";
import { commentaryArgs } from "@/features/game/view/commentary-view";

const goalRef: CommentaryRef = {
  key: "commentary.goal.0",
  values: { player: "Henry", minute: 45, homeScore: 2, awayScore: 1 },
};

describe("commentaryArgs", () => {
  it("passes raw values through and adds Fmt args for en", () => {
    const args = commentaryArgs(goalRef);
    expect(args.player).toBe("Henry");
    expect(args.minuteFmt).toBe(45);
    expect(args.homeScoreFmt).toBe(2);
    expect(args.awayScoreFmt).toBe(1);
  });

  it("keeps Western digits on ar too — the numbers are match furniture", () => {
    // ⚠️ REVERSED DELIBERATELY (owner's call). These used to be Eastern-Arabic numerals.
    // A minute, a scoreline, a shirt number and a rating are read as glyphs rather than
    // as prose, and switching numeral systems mid-match makes the broadcast furniture
    // harder to scan. Same reasoning as the player cards, English-only since PR #97.
    // Prose and aria-labels stay fully localised — only the digits are pinned.
    const args = commentaryArgs(goalRef);
    expect(args.minuteFmt).toBe(45);
    expect(args.homeScoreFmt).toBe(2);
    expect(args.awayScoreFmt).toBe(1);
  });

  it("omits Fmt args for values that are absent", () => {
    const args = commentaryArgs({ key: "commentary.kickoff", values: {} });
    expect(args.minuteFmt).toBeUndefined();
    expect(args.homeScoreFmt).toBeUndefined();
  });
});
