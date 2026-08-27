import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { isProbePath } from "@/utils/probe-path";

const intlMiddleware = createMiddleware(routing);

/**
 * ⭐ HOSTING COST — answer scanner traffic here, not in a Node function.
 *
 * Measured on production 2026-08-27: every unknown URL returned `x-vercel-cache: MISS` on
 * every request, because a 404 cannot be prerendered — `/wp-login.php` and `/xmlrpc.php`
 * matched `/[locale]`, `/wp-admin` and `/.git/config` matched `/[locale]/[...rest]`, and all
 * of them ran a React render to produce a 404. Middleware already runs on every page request
 * (that is the 60% of Fluid Active CPU that next-intl's `as-needed` prefixing costs by
 * construction), so short-circuiting here converts a Node invocation into a regex.
 *
 * ⚠️ Only the shapes in `isProbePath` — a mistyped real URL still reaches the branded
 * `not-found` page. See that module for why this is a denylist rather than an allowlist.
 */
export default function middleware(request: NextRequest): NextResponse {
  if (isProbePath(request.nextUrl.pathname)) {
    // ⚠️ No body. This branch is only reachable by something that already knows it is
    // fishing; a bare status is the cheapest honest answer and the least encouraging one.
    return new NextResponse(null, { status: 404 });
  }
  return intlMiddleware(request);
}

export const config = {
  matcher: [
    // Skip API, the Sentry monitoring tunnel, Next internals, and any path with a
    // file extension (metadata/asset conventions: sitemap.xml, robots.txt,
    // manifest.webmanifest, icon.svg, apple-icon, opengraph-image). Those must not
    // be locale-rewritten.
    "/((?!api|monitoring|_next|_vercel|.*\\..*).*)",

    /**
     * ⭐ Scanner traffic, which the rule above deliberately skips because it carries a dot.
     *
     * ⛔ A POSITIVE list of junk extensions, never a negative lookahead over the real ones.
     * The metadata conventions are open-ended — `.txt`, `.xml`, `.svg`, `.ico`, `.png`,
     * `.webmanifest` today, and whatever Next adds next — so a lookahead would silently start
     * swallowing one of them and break robots/sitemap/PWA with no test to notice. Listing the
     * junk instead can only ever fail SAFE: an extension nobody thought of just keeps the
     * behaviour we have today.
     */
    "/((?!api|monitoring|_next|_vercel).*\\.(?:php|phtml|php[0-9]|asp|aspx|jsp|jspx|cgi|pl|env|sql|bak|old|ini|sh|bash|yml|yaml|swp|log))",

    // Dot-directories: /.env, /.git/config, /.aws/credentials. ⚠️ `.well-known` is real —
    // ACME challenges and apple-app-site-association live there — and is excluded.
    "/(\\.(?!well-known)[^/]*.*)",
  ],
};
