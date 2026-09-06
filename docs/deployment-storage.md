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
