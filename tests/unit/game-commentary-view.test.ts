import { describe, expect, it } from "vitest";
import type { CommentaryRef } from "@/features/game/domain/commentary";
import { commentaryArgs } from "@/features/game/view/commentary-view";

const goalRef: CommentaryRef = {
  key: "commentary.goal.0",
  values: { player: "Henry", minute: 45, homeScore: 2, awayScore: 1 },
};

describe("commentaryArgs", () => {
  it("passes raw values through and adds Western digit Fmt args for en", () => {
    const args = commentaryArgs(goalRef, "en");
    expect(args.player).toBe("Henry");
    expect(args.minuteFmt).toBe("45");
    expect(args.homeScoreFmt).toBe("2");
    expect(args.awayScoreFmt).toBe("1");
  });

  it("produces Eastern-Arabic digit Fmt args for ar", () => {
    const args = commentaryArgs(goalRef, "ar");
    expect(args.minuteFmt).toBe("٤٥");
    expect(args.homeScoreFmt).toBe("٢");
    expect(args.awayScoreFmt).toBe("١");
  });

  it("omits Fmt args for values that are absent", () => {
    const args = commentaryArgs({ key: "commentary.kickoff", values: {} }, "ar");
    expect(args.minuteFmt).toBeUndefined();
    expect(args.homeScoreFmt).toBeUndefined();
  });
});
