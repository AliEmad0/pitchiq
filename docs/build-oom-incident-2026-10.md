# Production build out of memory (October 2026)

**Status:** fixed in TASK-M95 (PR #218). **Date:** 2026-10-12.
**Impact:** the production deploy of PR #217 failed, so production stayed on the
2026-09-06 build. Users kept seeing the old behaviour: "Full Season — In development" on most
game modes, and the five-card pick hand stacked one card per row on phones.

## 1. What happened

| When       | Event                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-12 | PR #217 (Full Season on every mode, phone-sized pick hands, TASK-1811 close-out) merged as `682f919` with CI and E2E green. |
| +45 min    | Vercel production build failed: **"The build exceeded Vercel's 45-minute limit."**                                          |
| Same code  | The PR's preview build (`e7a2adc`) had passed, but took 21 minutes after a 10-minute stall.                                 |

The Vercel build log showed the shape of the failure. Pages 0 → 14,370 of 19,161 were
generated in under six minutes; after that there was almost no progress for 40 minutes. The
pages that then failed were ordinary archive pages (2003-04 fixtures, player profiles),
logged as "took more than 60 seconds". Those render in milliseconds, so the build workers
themselves were starved.

Build history (from the Vercel API):

| Build                       | Build cache | ">60 s" page failures | Result                        |
| --------------------------- | ----------- | --------------------- | ----------------------------- |
| `00c69ca` prod (2026-09-06) | restored    | 24                    | Ready, 24.4 min               |
| `0df4487` prod              | restored    | 0                     | Ready, 13.9 min               |
| `8854e0e` prod              | restored    | 0                     | Ready, 14.7 min               |
| `e7a2adc` preview (#217)    | none        | 10                    | Ready, 21.4 min               |
| `682f919` prod (#217)       | none        | many                  | **Error, 45.6 min (timeout)** |

The build had been running close to a limit for weeks; whether a build passed depended on
how its pages happened to land across workers.

## 2. Investigation

All local measurements ran on WSL Ubuntu (6 GB RAM) with the production config
(`experimental.cpus: 2`), a 2 GB heap cap per worker (`--max-old-space-size=2048`), and
Google Fonts mocked through Next's `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` hook. The sandbox
cannot reach Google Fonts, which is otherwise why local builds hang.

### 2.1 It was not PR #217

| Commit                  | Local result                            | Peak RSS (one process) |
| ----------------------- | --------------------------------------- | ---------------------- |
| `8854e0e` (before #217) | `JavaScript heap out of memory` at 7:10 | 3.60 GB                |
| `main` (with #217)      | `JavaScript heap out of memory` at 6:32 | 3.62 GB                |

Both commits failed identically. The build was already at its memory limit; #217 only
landed on a build that tipped over.

### 2.2 Hypotheses that were tested and disproved

Each one was plausible, was tested with a full build, and failed. They are recorded here so
nobody spends time on them again.

| #   | Hypothesis                                                                 | Evidence for it                                                | Result                                                                                                         |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | `src/data/loaders.ts` caches every season's `lineups-*`/`events-*` forever | Worker heap grew in step with files cached (222 MB → 2,125 MB) | A 4-slot LRU for those files: **still out of memory** at page 12,721. The correlation was not the cause.       |
| 2   | Sentry 10's OpenTelemetry tracing retains render contexts                  | `promiseInitHook` (async_hooks) in the profile                 | Sentry off during the build (`NEXT_PHASE` gate, confirmed in every worker): **still out of memory** at 12,793. |
| 3   | Cached loader _promises_ pin the request context that created them         | Node 22's AsyncLocalStorage attaches context to promises       | Caching values instead of promises: **still out of memory** at 12,401.                                         |

### 2.3 What actually found it

1. **Sampling heap profile.** `inspector` `HeapProfiler.startSampling`, dumped at 1.2 GB.
   About 1.1 GB of live memory had been allocated inside React's Flight client
   (`app-page.runtime.prod.js`: `resolveModelChunk` and `_fromJSON`). The worker was holding
   the decoded RSC payload of pages it had already written. Data files were only 25–55 MB.
2. **Heap snapshot.** `v8.writeHeapSnapshot` at ~700 MB heap, which produced an 834 MB file.
   A streaming analyzer computed the shortest retainer paths:
   - 2,445 `Buffer`s held as `flightData` (157 MB), one per rendered page;
   - 2,421 RSC stream chunks held by `pull` closures (80 MB);
   - both reachable only through a chain of **4,897 pending `Timeout`s**. Each timer's
     `kResourceStore` held that page's render context.
3. **Timer probe.** An `async_hooks.createHook({ init })` on type `"Timeout"` recorded each
   timer's `_idleTimeout` and creation stack. There were two timers per page:
   - **300,000 ms** from TanStack Query's `Removable.scheduleGc`;
   - 60,000 ms from Next's own export-worker watchdog, which is bounded and harmless.

## 3. Root cause

`src/components/providers/QueryProvider.tsx` created every `QueryClient` with
`gcTime: 5 * 60 * 1000`. TanStack's own default is:

```js
updateGcTime(e) { this.gcTime = Math.max(this.gcTime || 0, e ?? (isServer ? Infinity : 3e5)) }
```

On the server the default is `Infinity`, which schedules **no** garbage-collection timer. The
explicit 5-minute value overrode that. The provider lives in the root layout, so every one of
the 19,161 prerendered pages created a server QueryClient whose query scheduled a 5-minute
timer. A Node timer captures the AsyncLocalStorage context of the code that created it, so
each timer kept the **entire finished page** in memory for five minutes. That included its
RSC payload buffer and stream chunks. A worker renders thousands of pages in five minutes,
so its heap filled before the first timers fired:

- **Locally, with a ~2 GB heap:** the worker crashed with "out of memory".
- **On Vercel, with a larger heap:** the worker garbage-collected near the ceiling and made
  almost no progress until the 45-minute limit killed the build.

## 4. Fix

```ts
export function queryDefaults(server: boolean) {
  return {
    staleTime: 60 * 1000,
    gcTime: server ? Infinity : 5 * 60 * 1000, // no timer on the server
    retry: 1,
    refetchOnWindowFocus: false,
  };
}
```

The browser keeps its 5-minute cache, so there is no user-visible change. A server
QueryClient lives for one render and has nothing to garbage-collect.

### Verification

|                             | Before                            | After                       |
| --------------------------- | --------------------------------- | --------------------------- |
| Local build (same 2 GB cap) | out of memory at ~12,500 / 19,161 | **19,161 / 19,161, exit 0** |
| Duration                    | n/a (crashed)                     | **9.5 min**                 |
| Peak RSS, one process       | 3.6 GB                            | **2.65 GB**                 |

`tests/unit/query-provider-server-gc.test.ts` asserts that a server-configured query leaves
no GC timer pending. Its control asserts that the browser defaults _do_ schedule one, which
proves the test can fail.

## 5. Rules this adds

- **No timer may be created during a server render.** A pending timer keeps that render's
  whole context alive, so a long delay pins the page for that long. This applies to library
  defaults too.
- **A server-side QueryClient never gets a finite `gcTime`.**
- **Prove a cause before shipping a fix.** Three plausible fixes failed here. A correlation
  in a memory probe is not a cause.

## 6. How to diagnose a build memory leak (the toolkit that worked)

| Question                             | Tool                                                                                                                                                    | Notes                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Does it reproduce?                   | Full local `next build` with Google Fonts mocked (`NEXT_FONT_GOOGLE_MOCKED_RESPONSES` pointing at a module that returns CSS for any URL) and a heap cap | Run detached (`setsid nohup`). Never run two builds at once: a 6 GB WSL crashed once.          |
| Which code allocated the live bytes? | `inspector` `HeapProfiler.startSampling` / `getSamplingProfile` from a temporary module loaded in the workers                                           | Group by leaf frame and by nearest app frame.                                                  |
| What holds them?                     | `v8.writeHeapSnapshot` at a moderate heap, plus a streaming analyzer (shortest retainer path from the GC root)                                          | V8 strings cap at ~512 MB, so a snapshot this size cannot be loaded with `JSON.parse`.         |
| Who created a pending timer?         | `async_hooks.createHook({ init })` on type `"Timeout"`, recording `_idleTimeout` and `new Error().stack`                                                | Patching `globalThis.setTimeout` **misses** Next and TanStack, which keep their own reference. |

Temporary probes were loaded from `src/data/loaders.ts` and were never committed.

## 7. Related changes made the same day

- **Daily data sync disabled.** The pipeline's `Sync Data (pipeline)` workflow is
  `disabled_manually`; the file is kept. Season 2025-26 is finished, the app stops at
  2025-26, and the daily runs were no-ops. A surprise data PR would also have auto-merged
  into this fragile production build. Re-enable it for a 2026-27 rollover.
- **Vercel no longer posts commit statuses to GitHub** (since about 2026-09-06). An empty
  GitHub status therefore does **not** mean "not deployed". Check the Vercel dashboard.

## 8. Open follow-up: Deployment Storage

The Vercel Hobby dashboard shows **Deployment Storage at 22.26 GB of 10 GB**, the only usage
line over its limit. Retention is already tight: previews kept 7 days, production 30 days,
errored and cancelled builds 1 day, `deploymentsToKeep` 10. Only six deployments existed,
which works out to about 4.4 GB per deployment. See
[`deployment-storage.md`](deployment-storage.md) for the measured breakdown and options.
