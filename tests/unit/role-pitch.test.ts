import { describe, expect, it } from "vitest";

import { PlayerRoleSchema } from "@/data/schemas";
import { ROLE_PITCH_POS } from "@/features/players/role-pitch";

describe("ROLE_PITCH_POS (TASK-M70)", () => {
  it("has a position for every one of the 13 roles", () => {
    for (const role of PlayerRoleSchema.options) {
      expect(ROLE_PITCH_POS[role], role).toBeDefined();
    }
  });

  it("keeps every coordinate within the pitch (0–100)", () => {
    for (const { x, y } of Object.values(ROLE_PITCH_POS)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(100);
    }
  });

  it("orders roles from own goal (GK) to the attacking end (CF)", () => {
    // Higher y = deeper. GK is the deepest, CF the most advanced.
    expect(ROLE_PITCH_POS.GK.y).toBeGreaterThan(ROLE_PITCH_POS.CB.y);
    expect(ROLE_PITCH_POS.CB.y).toBeGreaterThan(ROLE_PITCH_POS.CM.y);
    expect(ROLE_PITCH_POS.CM.y).toBeGreaterThan(ROLE_PITCH_POS.CF.y);
  });

  it("mirrors left/right roles across the pitch", () => {
    expect(ROLE_PITCH_POS.RB.x + ROLE_PITCH_POS.LB.x).toBe(100);
    expect(ROLE_PITCH_POS.RW.x + ROLE_PITCH_POS.LW.x).toBe(100);
    expect(ROLE_PITCH_POS.CB.x).toBe(50);
  });
});
