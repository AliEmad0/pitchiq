import type { CommentaryRef } from "@/features/game/domain/commentary";
import { localizeDigits } from "@/utils/format";

/**
 * Render bridge: raw ref values + display-localized digit args (`{…Fmt}`).
 * A future pitch UI renders a line as `t(ref.key, commentaryArgs(ref, locale))`.
 * Keeps `domain/` locale-free; `localizeDigits` is a no-op for en, Eastern-Arabic for ar.
 */
export function commentaryArgs(
  ref: CommentaryRef,
  locale: string,
): Record<string, string | number> {
  const v = ref.values;
  const args: Record<string, string | number> = { ...v };
  if (v.minute != null) args.minuteFmt = localizeDigits(v.minute, locale);
  if (v.homeScore != null) args.homeScoreFmt = localizeDigits(v.homeScore, locale);
  if (v.awayScore != null) args.awayScoreFmt = localizeDigits(v.awayScore, locale);
  if (v.added != null) args.addedFmt = localizeDigits(v.added, locale);
  return args;
}
