"use client";
import { parseAsString, useQueryState } from "nuqs";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

export interface ChoiceLinkProps {
  /** Where the choice leads, with no query of its own. */
  href: string;
  className?: string;
  children: ReactNode;
}

/**
 * A chooser link that CARRIES the chosen format down to the club (TASK-1811).
 *
 * ⛔ `ModeChooser` is a SERVER component and its page is `force-static`, so it can neither
 * read `searchParams` (that de-statics the route — the whole TASK-M71 arc) nor call
 * `useSearchParams`. Its sheet therefore built every link as a bare `/game/{mode}/{id}` and
 * dropped `?format=season` on the floor: the gate's format link and the club page's reader
 * were each correct in isolation, and a coach picking Full Season landed in an ordinary
 * single match with every screen on the way looking exactly right.
 *
 * ⛔ The param is MATCHED against the one literal we understand, never echoed. `format` is
 * user input, and an href is not the place to put it.
 *
 * ⚠️ On a COLD load of `/game/{mode}?format=season` the prerendered markup necessarily links
 * without the param — there is no server-side value to render — and the href corrects itself
 * on hydration. Reaching the sheet the normal way (the gate's format link) is a client-side
 * navigation, so the app is already hydrated and the window never opens.
 */
export function ChoiceLink({ href, className, children }: ChoiceLinkProps) {
  const [format] = useQueryState("format", parseAsString);
  return (
    <Link href={format === "season" ? `${href}?format=season` : href} className={className}>
      {children}
    </Link>
  );
}
