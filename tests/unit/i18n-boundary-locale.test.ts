import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * TASK-M89 — the `/ar` detail pages rendered the ENGLISH catalog.
 *
 * Root cause: a route-scoped `not-found.tsx` called `getTranslations()` from
 * `next-intl/server`. These boundary files receive **no `params`**, so they can
 * never call `setRequestLocale()` — and calling a next-intl SERVER API without a
 * locale resolves the request config to `defaultLocale` and memoizes it for the
 * whole render. Next prerenders the boundary as part of its segment's shell, so
 * the poisoning happened BEFORE the page and the shared layout rendered: both
 * then produced English even though `params.locale` was "ar" (which is why
 * `<html lang="ar">` stayed correct — that value comes from `params`, not from
 * next-intl).
 *
 * Measured on a production build: 541 of 940 Arabic renders were English, and
 * removing ONE of the three boundary files moved exactly its 2 pages back.
 *
 * The fix — already the pattern `error.tsx` was forced into by Next — is to make
 * these client components and read translations from `NextIntlClientProvider`,
 * which the layout hands an explicit `locale`. A client component never touches
 * the server request config, so it cannot poison it.
 *
 * This is the same family as the `loading.tsx` cache-poisoning deleted in
 * TASK-M72: a paramless boundary file doing locale-dependent SERVER work.
 */

const APP_DIR = join(process.cwd(), "src", "app");

/** App-router files that render without ever receiving `params`. */
const PARAMLESS_BOUNDARIES = ["not-found.tsx", "error.tsx", "loading.tsx", "template.tsx"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const boundaryFiles = walk(APP_DIR).filter((f) =>
  PARAMLESS_BOUNDARIES.includes(f.split(/[\\/]/).pop()!),
);

describe("paramless app-router boundaries must not use next-intl SERVER APIs", () => {
  it("finds the boundary files, so the assertion below is not vacuous", () => {
    // Guards the guard: a rename or a moved app dir would otherwise make every
    // assertion below pass over an empty list.
    expect(boundaryFiles.length).toBeGreaterThanOrEqual(4);
  });

  it.each(boundaryFiles.map((f) => [f.slice(APP_DIR.length + 1), f]))(
    "%s reads no locale from the server request context",
    (_label, file) => {
      const src = readFileSync(file, "utf8");
      expect(
        src.includes("next-intl/server"),
        `${file} imports next-intl/server. It receives no \`params\`, so it cannot call ` +
          `setRequestLocale() — the call resolves next-intl to defaultLocale and poisons ` +
          `the whole prerender (TASK-M89). Make it "use client" and use useTranslations().`,
      ).toBe(false);
    },
  );

  it("keeps a localized boundary rather than silently dropping translation", () => {
    // The cheap "fix" is to delete the translations entirely. Assert they still
    // localize — via the client API — so the guard can't be satisfied by
    // hardcoding English.
    const localized = boundaryFiles.filter((f) => readFileSync(f, "utf8").includes("next-intl"));
    expect(localized.length).toBeGreaterThanOrEqual(4);
    for (const f of localized) {
      expect(readFileSync(f, "utf8"), `${f} must be a client component`).toContain('"use client"');
    }
  });
});
