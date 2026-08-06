// The name shown large on a player card. Two-word (and shorter) names are kept
// whole — "Mohamed Salah", "Cristiano Ronaldo". Longer names collapse to the
// surname, keeping any nobiliary particles: "Edwin van der Sar" → "van der Sar",
// "Virgil van Dijk" → "van Dijk". A curated `override` always wins when set, so
// players known by a first name or nickname can opt out of the heuristic.

const PARTICLES = new Set([
  "van",
  "der",
  "den",
  "de",
  "del",
  "della",
  "di",
  "da",
  "dos",
  "das",
  "du",
  "la",
  "le",
  "von",
  "ten",
  "ter",
  "bin",
  "al",
  "el",
  "mac",
  "mc",
]);

export function displayName(full: string, override?: string | null): string {
  if (override != null && override.trim() !== "") return override.trim();
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2) return words.join(" ");
  let i = words.length - 1;
  while (i - 1 >= 0 && PARTICLES.has(words[i - 1]!.toLowerCase())) i--;
  return words.slice(i).join(" ");
}
