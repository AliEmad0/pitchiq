# Hosting cost — why this app must stay CDN-cached

PitchIQ runs on **Vercel Hobby**, which includes **4 hours of Fluid Active CPU per month**. Exceeding it pauses the project.

The app is ~1,700 prerendered pages plus ISR over committed JSON. There are no request-time data dependencies. **In a healthy state almost every page view is served from the CDN edge and costs zero Active CPU.** The monthly budget is therefore enormous — but only while the CDN is actually allowed to serve.

This document exists because that stopped being true twice without anyone noticing, and the second time the account was suspended.

---

## The failure mode: an uncacheable response

**A response carrying `Set-Cookie` cannot be cached by a shared CDN.** Vercel marks it `cache-control: private, no-cache, no-store` and returns `x-vercel-cache: MISS` — on every request, forever, even for a page that was prerendered at build time.

When that happens site-wide, **every page view runs a serverless function**. The page still renders correctly, tests still pass, the error rate stays 0%. The only symptom is a usage graph climbing toward the cap.

### What actually happened (2026-07)

`next-intl`'s middleware writes `Set-Cookie: NEXT_LOCALE` by default. The middleware matcher covers every HTML route, so **100% of page responses were uncacheable**. Measured on production:

| Route                                             | Through middleware? | Result                                |
| ------------------------------------------------- | ------------------- | ------------------------------------- |
| `/players/1001119` (prerendered at build)         | yes                 | `MISS`, `private, no-cache, no-store` |
| `/ar/players/1001119`                             | yes                 | `MISS`                                |
| `/robots.txt` (matcher excludes paths with a `.`) | **no**              | `HIT`, `age: 20603`, `public`         |
| `/api/og/player` (matcher excludes `/api`)        | **no**              | `HIT`, cached 1 year                  |

Every route that passed through the middleware was uncacheable. Every route that bypassed it cached perfectly. That contrast is the diagnostic.

Observed cost: **39,000 invocations in 12 hours**, `Cold Start <0.1%` (the functions never went idle), **44m 23s of the 4h monthly CPU burned in a single day** — a ~5.5-day runway.

**Fix:** `localeCookie: false` in `src/i18n/routing.ts`. Safe because `localeDetection` is already `false` — the cookie was never read, and the locale lives in the URL (`/ar/*`).

### Why the two earlier fixes didn't hold

PR #35 and PR #40 both attacked **cost per render** (making `/players/[id]` static, memoizing the data-file loaders). Both worked — P75 Active CPU sat at a healthy **42ms**. But per-render cost is the wrong lever when _nothing can be cached_: the invocation **count** was never reduced. The graph dipped because renders got cheaper, then climbed back as crawl volume grew.

**The lesson: measure `x-vercel-cache`, not render time.** A cheap render multiplied by every request in existence is still unaffordable.

---

## The three things that keep cost near zero

### 1. Responses must stay cacheable

Anything that makes a response `private`/`no-store` re-creates the outage:

- a cookie set in middleware (**the 2026-07 cause**),
- `cookies()` or `headers()` read in the root layout or a shared component,
- `export const dynamic = "force-dynamic"`,
- reading `searchParams` in a page that should be static (this is why `/players/[id]` must never read `?season=` — see CLAUDE.md).

**`revalidate` alone is not enough — the render falls back to dynamic.** A page needs `export const dynamic = "force-static"` alongside `revalidate`, or Vercel serves it `private, no-store` with `x-vercel-cache: MISS` and every view costs a function. Proven by a controlled preview experiment: two pages under `[locale]`, no data access, differing only in that line — force-static returned `public` + HIT, `revalidate`-only returned `private, no-store` + MISS.

**But `force-static` does NOT rescue a page that reads the server `searchParams` prop.** Its documented coercion covers `cookies()`, `headers()` and `useSearchParams()` — not `searchParams`. Such a page is opted into dynamic rendering and emits **zero** prerendered pages even with `generateStaticParams`. That is the current state of `/teams/[id]` and `/managers/[id]`; the only real fix is to stop reading `?season=` server-side, as `/players/[id]` already does.

Guarded by `tests/unit/i18n-routing.test.ts` and the daily `.github/workflows/cache-guard.yml` probe.

### 2. The crawlable surface is enormous — keep the hot set prerendered

34 seasons × 2 locales:

```
players/[id]     total  10,230   prebuilt 1,074   on-demand   9,156
fixtures/[id]    total  26,332   prebuilt   760   on-demand  25,572
teams/[id]       total     102   prebuilt     0   on-demand     102   ⚠️
managers/[id]    total     586   prebuilt     0   on-demand     586   ⚠️
                                    ~35,000 on-demand paths
                       (~351,000 counting ?season= variants)
```

⚠️ **`teams` and `managers` prebuild NOTHING**, despite both declaring
`generateStaticParams`, because both read the server `searchParams` prop (see
above). Verified by counting `.next/server/app/<locale>/<route>/*.html` after a
production build: players 537/locale, fixtures 380/locale, teams 0, managers 0.

**Do not trust the build's route table for this.** It prints `● (SSG)` for all
four routes — including the two that emit no pages at all. The only reliable
local check is counting the emitted `.html` files; the only reliable production
check is `x-vercel-cache` on a deployment.

An on-demand ISR path costs one invocation the first time it is requested **after each deploy** (a deploy invalidates the ISR cache). With near-daily deploys, a crawler walking the long tail pays that repeatedly. Prerendering the current season of each entity type keeps everything the app actually links to — dashboard rails, `/fixtures`, the sitemap — on the free path.

### 3. Crawl volume is the multiplier

39K requests/12h is not human traffic for a portfolio site. `robots.txt` blocks the aggressive AI/scraper agents (they crawl hard and send no traffic) while keeping Google, Bing and the social-preview unfurlers allowed, and applies `crawl-delay: 10` to the long tail of minor bots. `?season=` is disallowed because it multiplies each entity page by 34.

Robots is advisory. For agents that ignore it, block at the **Vercel Firewall** (Project → Firewall) — an edge block costs no Active CPU. Enable **Attack Challenge Mode** if usage ever spikes suddenly.

---

## If usage climbs again

1. **Check cacheability first** — it is nearly always this:

   ```bash
   curl -sS -o /dev/null -D - https://pitchiq-pl.vercel.app/players/1001119 \
     | grep -iE 'x-vercel-cache|cache-control|set-cookie'
   ```

   Want `x-vercel-cache: HIT` and a `public`/`s-maxage` cache-control. `MISS` + `private, no-store` means every page view is running a function — find what made responses uncacheable.

2. Compare against a middleware-exempt control (`/robots.txt`). If the control is `HIT` and pages are `MISS`, the fault is in middleware.

3. Only then look at per-route CPU in **Observability → Functions**. Active CPU ÷ invocations gives the per-render cost; if that number is small, the problem is volume, not rendering.

Run the probe on demand any time via the **Cache guard** workflow (`workflow_dispatch`).
