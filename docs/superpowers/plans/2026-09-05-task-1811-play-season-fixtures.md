# TASK-1811 PR 3 — play season fixtures

The season hub offers **Play fixture** alongside the existing default simulation controls.
It reuses MatchProgramme, MatchLive, MatchSummary, playReducer and useMatchDriver.
The hub stays mounted while a fixture runs, and Return to season commits the entire
matchweek: the played score for the coach and seeded simulations for the other fixtures.

## Contracts

- Preserve the league's exact XI, bench, formation, home/away order and fixtureSeed.
  Do not call the single-match draft builder or swap the coach into the home slot.
- The coach answers only his side's decisions. Opponent decisions retain defaultAnswer.
- Persist immutable, append-only results without event streams. A synchronous return guard
  prevents duplicate callbacks from recording a second week.
- Save week zero only on an explicit Play fixture action. Cancel preview leaves the week
  unchanged. Refreshing an unfinished fixture restarts from its fixed seed; completed
  matchweeks remain saved. The programme explains this before kickoff.
- The single-match IndexedDB slot and share codec remain independent. Season matches do
  not advertise a share link the codec cannot reproduce.
- New saves carry leagueIds in table-index order. Resume fetches exactly those clubs;
  failures block play and simulation, preserve storage, and offer retry or two-click abandon.
  Full legacy saves without IDs can migrate from their seed when every rival loads. A
  shortened legacy save has no recoverable club identity order and is blocked, never guessed.
- Read the season slot before exposing draft or advance controls.
- No engine calibration changes, new routes, new visual theme, Classic ghost, Survival
  objective, era substitutions, rotation or cross-fixture injuries in this slice.

## Validation

- Real streamed fixtures with default answers equal batch simulation for home and away.
- A distinct played score is retained, and every other fixture runs once with its own seed.
- StrictMode preview/live/summary/return exercises real decisions and engine output.
- Hub cancellation, duplicate returns, pending storage reads, identity mismatch, failed
  fetch/retry and remount persistence have focused component coverage.
- Browser coverage extends the existing expensive league test: simulate week one, cancel
  a preview, play away in week two, return, and reload the same table.
- Local type-check and lint pass. Full CI and browser results are recorded on the PR.
