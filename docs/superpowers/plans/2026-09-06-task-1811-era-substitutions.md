# TASK-1811 — historical substitution limits

Classic Season opts into a fixture-specific policy; mixed-era Legacy and every existing
single-match setup keep their previous five-player behavior. Never infer competition rules
from one player in a mixed-era squad.

## Implemented rules

| Season                     | Ordinary player limit                     | Stoppages         |
| -------------------------- | ----------------------------------------- | ----------------- |
| 1992/93–1993/94            | 2                                         | No separate limit |
| 1994/95                    | 2 unrestricted + 1 goalkeeper replacement | No separate limit |
| 1995/96–2018/19            | 3                                         | No separate limit |
| 2019/20 before the restart | 3                                         | No separate limit |
| 2019/20 from 17 June 2020  | 5                                         | 3, plus half-time |
| 2020/21–2021/22            | 3                                         | No separate limit |
| 2022/23 onward             | 5                                         | 3, plus half-time |

Sources: [FIFA rule history](https://www.fifa.com/en/tournaments/mens/worldcup/articles/substitutions-substitutes-rule-changes-history),
[BBC Premier League chronology](https://www.bbc.co.uk/sport/football/62224191),
[Premier League restart rules](https://www.premierleague.com/en/news/1676920),
[restart date](https://www.premierleague.com/en/news/1682374),
[2020/21 reversion](https://www.premierleague.com/news/1749286), and
[2022/23 permanent change](https://www.premierleague.com/en/news/2669074).

## Engine and interaction contracts

- Optional `MatchSetup.substitutions` is explicit. Both Classic auto-sim and playable
  fixtures resolve it from the historical season and actual fixture date.
- One shared gate controls replacements, advertised legal choices, forced injury changes
  and goalkeeper dismissal recovery. Exhaustion cannot be bypassed by a policy answer.
- Only successful replacements consume allowances. Declining, opening or closing a dialog
  consumes no regulatory stoppage. This differs from spending the UI's pending request.
- Engine time has minute precision. Changes accepted in the same minute share a stoppage;
  minute 45 represents the half-time opportunity. Separate sub-minute stoppages are not modeled.
- Five-sub matches can queue several changes in the existing bench dialog and submit one
  decision answer. This preserves the driver's duplicate-answer protection; do not issue
  repeated indistinguishable decisions with the same kind, minute and side.
- Auto policy groups changes according to remaining players and remaining windows. Half-time
  is offered, but declining it does not force an automatic change.
- Existing stored scores remain immutable. New rules govern future fixtures of saved runs;
  no old result is resimulated and no IndexedDB migration is needed.
- Classic has no match-share export. Grouped answers must not silently be added to the
  existing single-match token format; that requires a separate codec extension if reused.

## Bounds

This slice covers ordinary substitutions and grouped stoppages. It does not simulate
concussions, reconstruct historical named-bench sizes, add extra time, or infer a historical
year for mixed-era Legacy. These are not advertised as complete historical law simulation.
Squad rotation/injuries between matches and Survival remain separate TASK-1811 work.

## Validation

Historical boundary cases, goalkeeper allowance order, exhausted budgets, grouped changes,
UI batching, exact default-engine result equality, Classic saved fixtures and season progression
are covered. Mutation proof: ignoring the explicit policy made four engine tests fail.
Type-check and lint pass. 939 game regression tests and 15 decision-token tests passed.
All three Classic browser scenarios passed, including a modern grouped change and return
to the table; mobile batching passed separately with no horizontal overflow. CI must pass
on the PR head before merge.
