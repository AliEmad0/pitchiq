# TASK-1811 — Survival production integration

Approved layout: **01 / The Lifeline**, including opponent crests beside names in the center card and list.

## Behavior

Survival is an objective on the existing `/game/classic` season page. The selector preserves separate campaigns; `?objective=survival` resumes Survival after reload without adding prerender routes or another archive payload.

Take over a bottom-five club on 1 January. The archive prefix stays fixed; only results after takeover enter `survival-current` in the existing IndexedDB season store. The benchmark is one point above the final historically safe club. Final simulated standings decide safety; an exact points/GD/GF boundary tie stays unresolved.

1994/95 has four relegation places; other Premier League seasons have three ([Premier League history](https://www.premierleague.com/en/history)). Seasons with nonzero undated points adjustments are unavailable for Survival, with an explanation and a season selector. Classic archive coverage stays unchanged.

The shared season controller and squad editor retain strict read-before-write, exact failed-write retry, serialized actions, duplicate-return guards, fixture seeds, era substitution rules and injury recovery. No legal XI means explicit 0–3 forfeit. Midmatch reload restarts the fixture; completed results remain saved. No historical injury state is invented.

## Validation

- TypeScript and lint pass.
- Focused Vitest: 53 tests pass across seven suites. Coverage includes separate slots, suffix-only storage, archive/objective/seed/roster corruption, played injuries, recovery, full campaign resume, explicit forfeit, away orientation, Strict Mode and failed read/write recovery; Classic regressions also run.
- Playwright: the Survival journey passes in 10 seconds. It exercises simulate, live fixture, return, table changes, reload, objective switching and mobile overflow. Desktop/mobile screenshots show the approved crests.
- Local full Vitest attempts hit a native Node/libuv `uv__stream_destroy` assertion during unrelated comparison-page network teardown; both fork and thread pools are affected. Full CI and production build remain required before merge. No test exclusions or relaxed assertions were committed.
