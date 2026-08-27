/**
 * TASK-1842 — the nation → continent map behind the Nationality Draft's widening ring.
 *
 * ⭐ GEOGRAPHIC continents, not FIFA confederations, because the owner's words are "African
 * players" and "from Europe": Australia is Oceania (though it plays its football in the AFC),
 * Suriname is South America (though it plays in CONCACAF), and the transcontinental UEFA
 * members — Turkey, Russia, Georgia, Armenia, Israel, Cyprus — sit with Europe, where a
 * football reader expects them.
 *
 * ⚠️ Keys are flag-icons codes, exactly as `players-*.json` stores them: ISO 3166-1 alpha-2
 * lowercased, plus the `gb-*` home-nation subdivisions and `xk` (Kosovo, which has no ISO
 * assignment). The full set was measured off the committed data on 2026-08-27 — 128 codes —
 * and `tests/unit/game-continents.test.ts` walks the data files so a NEW code arriving in a
 * refresh fails the suite instead of silently drafting as "world".
 */
export type Continent = "eu" | "af" | "as" | "na" | "sa" | "oc";

const of =
  (continent: Continent) =>
  (acc: Record<string, Continent>, code: string): Record<string, Continent> => {
    acc[code] = continent;
    return acc;
  };

export const CONTINENTS: Record<string, Continent> = {
  ...`al am at ba be bg by ch cy cz de dk ee es fi fo fr gb-eng gb-nir gb-sct gb-wls ge gi gr
      hr hu ie il is it lt lv me mk mt nl no pl pt ro rs ru se si sk tr ua xk`
    .split(/\s+/)
    .reduce(of("eu"), {}),
  ...`ao bf bi bj cd cf cg ci cm cv dz eg ga gh gm gn gq gw ke lr ma ml mr mz ng sc sl sn tg
      tn tz za zm zw`
    .split(/\s+/)
    .reduce(of("af"), {}),
  ..."bd cn id iq ir jp kr om ph pk sy uz".split(/\s+/).reduce(of("as"), {}),
  ..."ag bb bm ca cr cu cw do gd gp gt hn ht jm kn mq ms mx tt us"
    .split(/\s+/)
    .reduce(of("na"), {}),
  ..."ar bo br cl co ec gy pe py sr uy ve".split(/\s+/).reduce(of("sa"), {}),
  ..."au nz".split(/\s+/).reduce(of("oc"), {}),
};

/** The continent a flag-icons code belongs to, or null for unknown/missing — never a guess. */
export function continentOf(code: string | null | undefined): Continent | null {
  return code != null ? (CONTINENTS[code] ?? null) : null;
}

/** Which ring of a nation's draft a card falls in. */
export type Ring = "nation" | "continent" | "world";

/**
 * ⛔ A card with no code — or an unmapped one — is WORLD, never nation. Anything else would
 * smuggle an unidentified player into the countrymen ring of every draft. The 6 uncoded rows
 * in the dataset are excluded from nation pools anyway; this is the deal-side belt to that
 * brace.
 */
export function ringOf(card: { nationalityCode?: string | null }, nation: string): Ring {
  const code = card.nationalityCode;
  if (code == null) return "world";
  if (code === nation) return "nation";
  const home = continentOf(nation);
  return home != null && continentOf(code) === home ? "continent" : "world";
}
