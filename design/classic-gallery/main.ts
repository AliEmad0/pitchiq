import { concepts, renderConcept } from "./layouts";
import data from "./data.json";
import { advanceClassic } from "../pitchiq/src/features/game/view/classic-run";
import { classicLineup } from "../pitchiq/src/features/game/domain/classic-lineup";
import { formationByName } from "../pitchiq/src/features/game/domain/formation";
import { compareHistoricalRun } from "../pitchiq/src/features/game/domain/classic-season";
import { seasonTable } from "../pitchiq/src/features/game/domain/season";
import { makeGameTeam } from "../pitchiq/src/features/game/domain/team";

const names = concepts.map((c) => c[0]);
const savedConcept = Number.parseInt(localStorage.getItem("classic-concept-v2") ?? "", 10) - 1;
let concept =
  Number.isInteger(savedConcept) && savedConcept >= 0 && savedConcept < 30 ? savedConcept : 0;
let year = 1,
  coachId = 42,
  shape = "",
  teams: any[] = [],
  run: any;
const $ = (id: string) => document.getElementById(id)!;
const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const selected = () => (data as any[])[year];
const logo = (id: number) =>
  `<img alt="" width="28" height="28" src="/logos/${id}.png" onerror="this.style.display='none'">`;
function reset() {
  const d = selected();
  if (!d.clubIds.includes(coachId)) coachId = d.clubIds[0];
  const own = d.squads.find((c: any) => c.teamId === coachId);
  if (!own.formations.includes(shape))
    shape = own.formations.includes("4-4-2 Flat") ? "4-4-2 Flat" : own.formations[0];
  teams = d.squads.map((c: any) => {
    const f = {
      ...formationByName(c.teamId === coachId ? shape : c.formations[0]),
      season: d.season,
    };
    const xi = classicLineup(c.pool, f)!;
    const used = new Set(xi.map((p) => p.playerId));
    const bench = c.pool
      .filter((p: any) => !used.has(p.playerId))
      .sort(
        (a: any, b: any) =>
          (a.role === "GK" ? -1 : 0) - (b.role === "GK" ? -1 : 0) ||
          b.ratings.overall - a.ratings.overall,
      )
      .slice(0, 7);
    return makeGameTeam(c.teamId, c.name, d.season, f, xi, bench);
  });
  run = { seed: 4242, coach: d.clubIds.indexOf(coachId), results: [] };
  render();
}
function advance(count = 1) {
  for (let i = 0; i < count; i++) run = advanceClassic(selected().schedule, teams, run);
  render();
}
function choose(c: number) {
  concept = c;
  render();
  document.getElementById("label")!.scrollIntoView({ block: "start" });
}
function render() {
  const d = selected(),
    coach = teams[run.coach],
    schedule = d.schedule;
  const ownFixtures = schedule.fixtures.filter(
    (f: any) => f.home === run.coach || f.away === run.coach,
  );
  const ownIds = new Set(ownFixtures.map((f: any) => f.id));
  const ghost = compareHistoricalRun(
    schedule,
    run.coach,
    run.results.filter((r: any) => ownIds.has(r.fixtureId)),
  );
  const table = seasonTable(
    d.clubIds.length,
    run.results.map((r: any, i: number) => ({ ...schedule.fixtures[i], ...r, week: i })),
  );
  const target = d.table.find((t: any) => t.club === run.coach);
  const next = ownFixtures[ghost.played];
  const last = ghost.comparisons.at(-1);
  const ctx = context(d, coach, ghost, table, target, next, last, ownFixtures);
  $("stage").className = "";
  $("label").textContent = `${String(concept + 1).padStart(2, "0")} / ${names[concept]}`;
  $("description").textContent = concepts[concept][1];
  $("selected").textContent = localStorage.getItem("classic-concept-v2")
    ? `Saved: ${localStorage.getItem("classic-concept-v2")}`
    : "Choose your favourite direction";
  $("stage").innerHTML = renderConcept(concept, ctx);
  $("stage")
    .querySelectorAll("[data-action]")
    .forEach(
      (el: any) =>
        (el.onclick = () =>
          el.dataset.action === "reset" ? reset() : advance(el.dataset.action === "five" ? 5 : 1)),
    );
  if (!$("gallery").children.length) {
    $("gallery").innerHTML = concepts
      .map(
        ([name, desc], i) =>
          `<button class="thumb" data-concept="${i}"><span class="preview-window" aria-hidden="true" inert><span class="preview-canvas">${renderConcept(i, ctx).replace(/<button\b[^>]*>[\s\S]*?<\/button>/g, "")}</span></span><strong>${String(i + 1).padStart(2, "0")} / ${name}</strong><small>${desc}</small></button>`,
      )
      .join("");
    $("gallery")
      .querySelectorAll("[data-concept]")
      .forEach((el: any) => (el.onclick = () => choose(Number(el.dataset.concept))));
  }
  $("season").innerHTML = (data as any[])
    .map(
      (d, i) =>
        `<option value="${i}" ${i === year ? "selected" : ""}>${d.season}–${String(d.season + 1).slice(-2)}</option>`,
    )
    .join("");
  $("club").innerHTML = d.squads
    .map(
      (c: any) =>
        `<option value="${c.teamId}" ${c.teamId === coachId ? "selected" : ""}>${esc(c.name)}</option>`,
    )
    .join("");
  $("shape").innerHTML = d.squads
    .find((c: any) => c.teamId === coachId)
    .formations.map((f: string) => `<option ${f === shape ? "selected" : ""}>${esc(f)}</option>`)
    .join("");
  document
    .querySelectorAll("[data-concept]")
    .forEach((el: any) =>
      el.setAttribute("aria-pressed", String(Number(el.dataset.concept) === concept)),
    );
}
$("season").onchange = (e: any) => {
  year = Number(e.target.value);
  shape = "";
  reset();
};
$("club").onchange = (e: any) => {
  coachId = Number(e.target.value);
  shape = "";
  reset();
};
$("shape").onchange = (e: any) => {
  shape = e.target.value;
  reset();
};
$("save").onclick = () => {
  localStorage.setItem("classic-concept-v2", `${concept + 1} — ${names[concept]}`);
  render();
};
(window as any).classicGallery = {
  choose,
  reset,
  advance,
  state: () => ({ concept, results: run.results.length, coach: run.coach }),
};
reset();

$("prev").onclick = () => choose((concept + 29) % 30);
$("next").onclick = () => choose((concept + 1) % 30);
function context(
  d: any,
  coach: any,
  ghost: any,
  table: any,
  target: any,
  next: any,
  last: any,
  ownFixtures: any[],
) {
  let p = 0,
    h = 0;
  const cumulative = ghost.comparisons.map((r: any) => [
    (p += r.points),
    (h += r.historicalPoints),
  ]);
  return {
    year: d.season,
    id: coachId,
    club: coach.name,
    shape,
    played: ghost.played,
    total: ghost.total,
    complete: ghost.complete,
    points: ghost.points,
    history: ghost.historicalPoints,
    delta: ghost.pointsDelta,
    target: target.points,
    rank: target.rank,
    date: next?.date.slice(0, 10) ?? ownFixtures.at(-1).date.slice(0, 10),
    opponent: next
      ? esc(teams[next.home].name) + " v " + esc(teams[next.away].name)
      : "Season complete",
    venue: next ? (next.home === run.coach ? "Home fixture" : "Away fixture") : "Final table",
    realScore: next ? `${next.homeGoals}–${next.awayGoals}` : "—",
    lastScore: last ? `${last.goalsFor}–${last.goalsAgainst}` : "—",
    lastReal: last
      ? `${last.historicalGoalsFor}–${last.historicalGoalsAgainst}`
      : "Awaiting the opener",
    leaguePlayed: run.results.length,
    leagueTotal: d.schedule.fixtures.length,
    cumulative,
    table: table.map((r: any) => ({
      id: teams[r.club].teamId,
      name: teams[r.club].name,
      played: r.played,
      gd: r.goalDifference,
      points: r.points,
      own: r.club === run.coach,
    })),
    fixtures: ownFixtures.map((f: any) => {
      const side = f.home === run.coach ? "H" : "A",
        opponent = teams[side === "H" ? f.away : f.home].name;
      return {
        date: f.date.slice(0, 10),
        side,
        opponent,
        short: opponent.slice(0, 10),
        score: `${f.homeGoals}–${f.awayGoals}`,
      };
    }),
    squad: coach.players.map((p: any, i: number) => {
      const slot = coach.formation.slots[i],
        same = coach.formation.slots.filter((s: any) => s.row === slot.row);
      return {
        name: p.name,
        role: slot.role,
        ovr: p.ratings.overall,
        x: (slot.col / (same.length + 1)) * 100,
        y:
          90 -
          ((slot.row - 1) / (Math.max(...coach.formation.slots.map((s: any) => s.row)) - 1)) * 75,
      };
    }),
  };
}
