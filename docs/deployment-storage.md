# Deployment storage

## September 6, 2026 investigation

The owner reported 412.99 GB of Deployment Storage and 25 GB of Functions Storage
in Vercel, with a 10 GB included-storage notification. These are account dashboard
figures, not the size of one checkout or one build. The current retention policy
and per-deployment production sizes have not yet been inspected with account access.

PR #214 (season injury carryover and Classic/Legacy rotation) merged as `00c69ca`
after CI, Playwright, and Vercel passed. Storage work follows on a separate branch.

## Shared translation catalogs

The root locale layout previously passed all messages to a client provider. That
serialized the complete catalog into each page's RSC payload and embedded HTML.
The compact English catalog is 53,196 bytes, repeated across roughly 19,000 pages.

`src/i18n/providers` now selects a locale-specific client component on the server.
Each client module imports its own catalog, putting it in a shared JavaScript chunk.
Only children cross the server/client boundary. Each provider sets its locale
explicitly. The bundler may include both catalogs in the shared layout chunk; they
are no longer repeated per page. Server-side translation
loading stays in `src/i18n/request.ts`. No pages, history, or static cache contracts
were removed. Adding another supported language requires a matching client provider.

Measured on the same local Next dev `/map` response:

| Response  |          Bytes |
| --------- | -------------: |
| Before    |        241,341 |
| After     |        185,561 |
| Reduction | 55,780 (23.1%) |

This is an uncompressed development HTML measurement, not a claim about Vercel's
billed storage reduction or the full production build. Confirm production Resources
and Usage after deployment. The catalog now incurs a shared JS download; it is not
removed from the application. Browser coverage verifies no catalog key in map HTML,
then exercises translated controls and client navigation. Vitest covers both locales.

## Account cleanup still required

New smaller output will not remove old retained deployments. In PitchIQ's Vercel
Settings > Security > Deployment Retention Policy, review the existing periods.
Proposed policy for owner review: 7 days for preview, errored, and canceled builds;
30 days for production. Preserve the live deployment, rollback history, and any
preview needed for review. Do not apply a team-wide change to unrelated projects.

No retention changes or deployment deletions have been made by this code change.
Vercel browser access failed in this session and no CLI login was available.
After an approved cleanup, compare the same project and time range in Usage.
Retention exceptions can preserve recent deployments and active aliases; cleanup
is asynchronous, so a new policy does not guarantee an immediate drop below 10 GB.

Official references:

- https://vercel.com/docs/deployment-storage/optimize
- https://vercel.com/docs/deployment-retention

Do not trade storage for the previous runtime-cost regression: retain
`dynamicParams = false` on entity routes and never add positive `revalidate` values.
Do not exclude runtime JSON from function tracing without measuring the bundle and
proving all affected routes can still load their data.

## October 12, 2026 measurement

Dashboard: **Deployment Storage 22.26 GB of 10 GB**. Every other Hobby line is far below its
cap: Fluid Active CPU 4 min of 4 h, Functions Storage 0.89 GB of 10 GB.

The retention policy is already set (read from the Vercel project API): preview 7 days,
production 30 days, errored and cancelled 1 day, `deploymentsToKeep` 10. Only **six**
deployments existed, so cleanup cannot fix this. One deployment is about 4.4 GB, and every
merge adds a production build plus a preview build.

A full local build (TASK-M95) produced **4.9 GB** of output:

| Route                               | Size       | Files  |
| ----------------------------------- | ---------- | ------ |
| `/fixtures/*` (~13,000 match pages) | **2.5 GB** | 39,498 |
| `/players/*`                        | 1.0 GB     | 15,345 |
| `/seasons/*`                        | 110 MB     | 597    |
| `/game/*`                           | 105 MB     | 492    |
| `/managers/*`                       | 51 MB      | 879    |
| `/teams/*`                          | 14 MB      | 153    |

| File kind | Size     | Files  |
| --------- | -------- | ------ |
| `.html`   | 2,490 MB | 18,998 |
| `.rsc`    | 1,387 MB | 18,998 |

Every page is stored twice, as HTML (131 KB average) and as its RSC payload (73 KB average).
To stay under 10 GB with more than one deployment alive, a build has to shrink well below
half of its current size. The levers, in order of expected yield:

1. Shrink the per-page payload, starting with what dominates a fixture page.
2. Prerender fewer archive pages, without breaking the hard rules: `force-static`,
   `dynamicParams = false`, no positive `revalidate`, and `entity-routes-bounded.test.ts`.
3. Stop Vercel building previews for non-`main` branches, since each PR push adds another
   ~4.4 GB. This needs the owner's decision.

## TASK-M96 PR A result (2026-10-13)

Old matches moved to the static-data archive and branch previews turned off. Full local build:
**4.9 GB → 2.7 GB**. `/fixtures/*` fell from 2.5 GB to 83 MB (current season only), plus
174 MB of archive JSON (12,786 files, ~13.6 KB each). The build took 7.8 minutes instead
of 9.5, at the same 2.7 GB peak memory. Next step (PR B): archived players, about 1 GB.

## TASK-M96 PR B result (2026-10-13)

Archived players (4,578 with no current-season row) moved to the same pattern. Full local
build, deployable output only (excluding Next's local `.next/cache`): **~3.9 GB → ~0.8 GB**.

| Output               | Before   | After                |
| -------------------- | -------- | -------------------- |
| `/players/*` pages   | 1,030 MB | 113 MB (537 players) |
| archived player JSON | n/a      | 49 MB                |
| `/fixtures/*` pages  | 2,560 MB | 83 MB                |
| archived match JSON  | n/a      | 104 MB               |

The build took 5.8 minutes instead of 9.5. Branch previews are off, so the three deployments
Vercel always keeps total about 2.4 GB of the 10 GB limit. Confirm the dashboard's Deployment
Storage figure after old deployments age out of retention (up to 30 days).
