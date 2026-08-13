import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLLECTION_SURFACES, GAME_MODES, MODE_GROUPS } from "@/features/game/domain/modes";
import ar from "@/i18n/messages/ar.json";
import en from "@/i18n/messages/en.json";

/**
 * The registry is the file that will rot as modes unlock, so it is the file that gets
 * guarded. Everything the gate renders comes from here — a mode pointing at a route that
 * does not exist, or a label key missing from one locale, is invisible until a user hits
 * it.
 */

/** Every `page.tsx` under app/[locale]/game, as a route path like "/game/chaos". */
function gameRoutes(): string[] {
  const root = join(process.cwd(), "src", "app", "[locale]", "game");
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, `${prefix}/${entry}`);
      else if (entry === "page.tsx") out.push(prefix);
    }
  };
  walk(root, "/game");
  return out;
}

describe("the mode registry", () => {
  it("has unique ids", () => {
    const ids = GAME_MODES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every live format somewhere to go", () => {
    for (const mode of GAME_MODES) {
      const anyLive = Object.values(mode.formats).some((s) => s === "live");
      if (anyLive) expect(mode.href, `${mode.id} is live but has no href`).not.toBeNull();
    }
  });

  it("points every href at a route that exists", () => {
    const routes = gameRoutes();
    for (const mode of GAME_MODES) {
      if (mode.href == null) continue;
      expect(routes, `${mode.id} -> ${mode.href}`).toContain(mode.href);
    }
  });

  it("resolves every label key in BOTH locales", () => {
    const keys = [
      ...GAME_MODES.flatMap((m) => [m.nameKey, m.descriptionKey]),
      ...COLLECTION_SURFACES.map((c) => c.nameKey),
      ...MODE_GROUPS.map((g) => g.labelKey),
    ];
    for (const key of keys) {
      expect(en.game, `en.game.${key}`).toHaveProperty(key);
      expect(ar.game, `ar.game.${key}`).toHaveProperty(key);
    }
  });

  it("assigns every mode to a declared group", () => {
    const groups = new Set(MODE_GROUPS.map((g) => g.id));
    for (const mode of GAME_MODES) expect(groups).toContain(mode.group);
  });
});
