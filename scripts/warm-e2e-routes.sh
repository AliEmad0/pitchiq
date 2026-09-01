#!/usr/bin/env bash
# Compile every route the E2E suite touches BEFORE Playwright starts.
#
# The E2E job runs `next dev` (see .github/workflows/e2e.yml for why MSW forces
# that), so routes are compiled on demand. Two things follow, and both used to
# land inside test assertions:
#
#   1. The first test to reach a route pays its compile. A cold `/[locale]`
#      compile has been measured at 11.9s against a 12s `expect` timeout.
#   2. Every compile broadcasts an HMR "rebuilding" event to every open page,
#      so an unrelated worker's page churns while it is mid-assertion. Traces
#      from failing runs show 15 such events during a single 12s wait.
#
# Warming up front moves all of that before the first test, and leaves the
# server quiet while the suite runs. One URL per route pattern is enough —
# Turbopack compiles per route, not per param.
set -uo pipefail

BASE="${PLAYWRIGHT_BASE_URL:-http://localhost:3000}"

ROUTES=(
  "/"
  "/ar"
  "/players"
  "/players/1000457"
  "/teams"
  "/teams/42"
  # Historical seasons render dynamically off a different data path than the
  # current season, and the teams specs deep-link straight into them.
  "/teams/42?season=2011"
  "/teams/33?season=1993"
  "/ar/teams/42?season=2003"
  "/managers"
  "/fixtures"
  "/leaderboards"
  "/compare"
  "/map"
  "/seasons"
  "/seasons/2003"
  "/seasons/2003/teams"
  "/game"
  "/game/chaos"
  "/game/draft"
  "/game/daily"
  "/game/budget"
  "/game/legacy"
  "/game/legacy/40"
  "/game/nation"
  "/game/nation/eg"
  "/game/nation/fr"
  # Cold, this one builds the 600-card cross-era pool AND its captaincy counts.
  "/game/chemistry"
  # The rival squad the draft screen fetches as soon as it mounts (TASK-1810
  # follow-up). Cold, it is a full club-history build.
  "/api/game/rivals/40"
  "/game/demo"
  "/definitely-not-a-page"
  "/api/search?q=haaland"
  "/api/players/suggested"
  "/api/players/1000457/seasons"
  "/api/players/1000457/profile?season=2025&locale=en"
  "/api/trivia?scope=player&id=1000457&season=2025"
  "/api/teams/42/season-view?season=2025"
)

echo "Warming ${#ROUTES[@]} routes at $BASE"
slowest=0
for r in "${ROUTES[@]}"; do
  # -L: locale-prefixed redirects. Status is informational — 404s are expected
  # for the not-found warm-up, and a non-200 still compiled the route.
  read -r code secs < <(
    curl -sL -o /dev/null -w '%{http_code} %{time_total}' --max-time 120 "$BASE$r" || echo "000 0"
  )
  ms=$(awk -v s="$secs" 'BEGIN { printf "%d", s * 1000 }')
  [ "$ms" -gt "$slowest" ] && slowest=$ms
  printf '  %-52s %s %6sms\n' "$r" "$code" "$ms"
done
echo "Warm-up done; slowest route ${slowest}ms"

# A compile slower than the suite's 12s expect timeout means a first-touch
# assertion could still race it. Warn loudly rather than fail — the warm-up
# itself has already absorbed the cost for the tests.
if [ "$slowest" -gt 12000 ]; then
  echo "::warning::Slowest route warm-up was ${slowest}ms, above the 12s expect timeout."
fi
