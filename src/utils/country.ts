// Country display name from a flag-icons code (TASK-M49). Managers' nationality
// is stored as a flag-icons code (ISO-2 lowercased, or a `gb-eng`/`gb-sct`/
// `gb-wls`/`gb-nir` home-nation code from an override). We derive the display
// name at render time via Intl.DisplayNames so the committed bio map can stay
// lean (code only); an override may set an explicit `nationality` to override.

/**
 * Codes Intl.DisplayNames cannot resolve: the flag-icons home-nation subdivisions, and
 * `xk` (Kosovo has no ISO 3166-1 assignment). ⚠️ Arabic pairs live HERE beside the English
 * ones rather than in the catalog — these are proper names resolved by a util that predates
 * next-intl's involvement, and splitting them across two sources is how one goes stale
 * (TASK-1842; the M89 rule is the reason the Arabic half exists at all).
 */
const UNRESOLVABLE: Record<string, Record<string, string>> = {
  en: {
    "gb-eng": "England",
    "gb-sct": "Scotland",
    "gb-wls": "Wales",
    "gb-nir": "Northern Ireland",
    xk: "Kosovo",
  },
  ar: {
    "gb-eng": "إنجلترا",
    "gb-sct": "اسكتلندا",
    "gb-wls": "ويلز",
    "gb-nir": "أيرلندا الشمالية",
    xk: "كوسوفو",
  },
};

const display = new Map<string, Intl.DisplayNames>();
function regionNames(locale: string): Intl.DisplayNames {
  let d = display.get(locale);
  if (d == null) {
    d = new Intl.DisplayNames([locale], { type: "region", fallback: "none" });
    display.set(locale, d);
  }
  return d;
}

/**
 * A country display name from a flag-icons code. Returns null on null/unknown so
 * callers can render an override name or just the flag.
 *
 * ⚠️ `locale` defaults to English so every pre-TASK-1842 caller is byte-identical; the
 * Nationality Draft passes the request locale, because a nation's NAME is the subject of
 * its chooser tile and its page title, and an English name on `/ar` is the M89 class of bug.
 */
export function countryNameFromCode(
  code: string | null | undefined,
  locale: string = "en",
): string | null {
  if (!code) return null;
  const hard = (UNRESOLVABLE[locale] ?? UNRESOLVABLE["en"])?.[code];
  if (hard) return hard;
  if (!/^[a-z]{2}$/.test(code)) return null;
  try {
    const name = regionNames(locale).of(code.toUpperCase());
    // `fallback: "none"` → undefined for an unassigned code; the reserved "ZZ"/"XX" codes
    // map to the CLDR "Unknown Region" sentinel in every locale — treat both as null. The
    // English sentinel check is kept for the pinned-"en" default path.
    return name && name !== "Unknown Region" ? name : null;
  } catch {
    return null;
  }
}
