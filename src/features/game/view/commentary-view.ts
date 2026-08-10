import type { CommentaryRef } from "@/features/game/domain/commentary";

/**
 * Render bridge: raw ref values plus the `{…Fmt}` display args the catalog interpolates.
 *
 * ⚠️ The `Fmt` args are WESTERN DIGITS IN EVERY LOCALE (owner's call), matching the
 * player cards, which have been English-only since PR #97. A minute, a scoreline and a
 * shirt number are read as glyphs rather than as prose, and switching numeral systems
 * mid-match makes the broadcast furniture harder to scan. There is no `locale` parameter any
 * more — it had no effect once the digits were pinned, and an argument that changes
 * nothing is worse than no argument at all.
 */
export function commentaryArgs(ref: CommentaryRef): Record<string, string | number> {
  const v = ref.values;
  const args: Record<string, string | number> = { ...v };
  if (v.minute != null) args.minuteFmt = v.minute;
  if (v.homeScore != null) args.homeScoreFmt = v.homeScore;
  if (v.awayScore != null) args.awayScoreFmt = v.awayScore;
  if (v.added != null) args.addedFmt = v.added;
  return args;
}
