import dataRaw from "../../artifacts/survival-gallery/data.json";
import logosRaw from "../../artifacts/survival-gallery/logos.json";
import { concepts, renderConcept, esc } from "./layouts";
import type { ClassicData } from "../../src/features/game/domain/classic-data";
import { classicTeams } from "../../src/features/game/view/classic-session";
import { advanceSurvival, type SurvivalRun } from "../../src/features/game/view/survival-run";
import { survivalScenario, survivalProgress } from "../../src/features/game/domain/survival";
import {
  availableSeasonTeam,
  rotateSeasonTeam,
} from "../../src/features/game/domain/season-availability";
import { canPlay } from "../../src/features/game/domain/eligibility";
import { seasonTable } from "../../src/features/game/domain/season";
import type { GameTeam } from "../../src/features/game/domain/team";

const data = dataRaw as unknown as ClassicData[];
const logos = logosRaw as Record<string, string>;
const $ = (id: string) => document.getElementById(id)!;
let index = 0,
  yearIndex = 2,
  clubId = 746,
  shape = "4-4-2 Flat",
  teams: GameTeam[] = [],
  run: SurvivalRun;
let message = "",
  storageAvailable = true;
const selected = () => data[yearIndex];
const logo = (id: number) => (logos[id] ? `<img src="${logos[id]}" alt="">` : "");
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    storageAvailable = false;
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    storageAvailable = false;
    message = "Browser storage unavailable. Keep this page open to preserve the campaign.";
  }
};
const archive = () => selected().archiveKey;
function candidates() {
  const d = selected(),
    cut = `${d.season + 1}-01-01`;
  const bottom = seasonTable(
    d.clubIds.length,
    d.schedule.fixtures
      .filter((f) => Date.parse(f.date) < Date.parse(cut))
      .map((f) => ({ ...f, week: 0, seed: 0 })),
  ).slice(-5);
  return bottom.map((r, j) => ({
    id: d.clubIds[r.club],
    rank: d.clubIds.length - 4 + j,
    points: r.points,
    name: d.squads.find((c) => c.teamId === d.clubIds[r.club])!.name,
  }));
}
function reset() {
  const d = selected(),
    choices = candidates();
  if (!choices.some((c) => c.id === clubId)) clubId = choices[0].id;
  const c = d.squads.find((c) => c.teamId === clubId)!;
  if (!c.formations.includes(shape)) shape = c.formations[0];
  teams = classicTeams(d, clubId, shape);
  const coach = d.clubIds.indexOf(clubId),
    target = d.table.find((r) => r.rank === d.clubIds.length - 3)!.points + 1;
  run = {
    seed: 1811,
    coach,
    results: [],
    scenario: survivalScenario(d.schedule, coach, `${d.season + 1}-01-01`, target),
    injuries: [],
  };
  message = "New Year takeover. The historical baseline is locked.";
  persist();
  render(true);
}
function persist() {
  write(
    "survival-gallery-run-v1",
    JSON.stringify({
      version: 1,
      yearIndex,
      clubId,
      shape,
      run,
      archive: archive(),
      cards: teams[run.coach].players.map((p) => p.cardId),
    }),
  );
}
function context() {
  const d = selected(),
    p = survivalProgress(d.schedule, run.scenario, run.results),
    own = teams[run.coach];
  const available = availableSeasonTeam(
    own,
    run.injuries,
    d.squads.find((c) => c.teamId === clubId)!.pool,
  );
  const squad = available ?? own;
  const table = p.table.map((r, j) => ({
    ...r,
    rank: j + 1,
    id: d.clubIds[r.club],
    name: d.squads.find((c) => c.teamId === d.clubIds[r.club])!.name,
    own: r.club === run.coach,
  }));
  const f = p.remaining[0];
  return {
    clubId,
    club: own.name,
    year: d.season,
    progress: p,
    target: run.scenario.targetPoints,
    logo,
    table,
    safe: table[p.safePlaces - 1],
    available,
    nextDate: f ? f.date.slice(0, 10) : "FULL TIME",
    venue: f ? (f.home === run.coach ? "HOME" : "AWAY") : "FINAL TABLE",
    opponent: f ? teams[f.home === run.coach ? f.away : f.home].name : "The season is over",
    fixtures: p.remaining.map((f) => ({
      name: teams[f.home === run.coach ? f.away : f.home].name,
      date: f.date.slice(0, 10),
      venue: f.home === run.coach ? "H" : "A",
    })),
    squad: squad.players.map((p, j) => {
      const slot = squad.formation.slots[j],
        same = squad.formation.slots.filter((s) => s.row === slot.row);
      return {
        name: p.name,
        role: slot.role,
        ovr: p.ratings.overall,
        injury: run.injuries?.find((i) => i.cardId === p.cardId)?.remaining,
        x: (slot.col / (same.length + 1)) * 100,
        y: 90 - ((slot.row - 1) / (Math.max(...squad.formation.slots.map((s) => s.row)) - 1)) * 75,
      };
    }),
  };
}
function advance(count: number, forfeit = false) {
  let done = 0;
  for (let i = 0; i < count; i++) {
    const c = context();
    if (c.progress.complete) break;
    if (!c.available && !forfeit) {
      message = "No legal XI is available. Use the explicit forfeit button to advance recovery.";
      break;
    }
    if (c.available) teams[run.coach] = c.available;
    run = advanceSurvival(selected().schedule, teams, run, undefined, forfeit);
    done++;
    if (forfeit) break;
  }
  if (done) {
    const last = run.results.at(-1)!;
    message = `${done} coach fixture${done === 1 ? "" : "s"} completed. Latest league result ${last.homeGoals}–${last.awayGoals}. Results saved.`;
  }
  persist();
  render();
}
function choose(i: number) {
  index = (i + 30) % 30;
  render();
  document.querySelectorAll(".tile").forEach((e, j) => e.classList.toggle("active", j === index));
}
function render(grid = false) {
  const c = context();
  $("title").textContent = `${String(index + 1).padStart(2, "0")} / ${concepts[index][0]}`;
  $("description").textContent = concepts[index][1];
  $("stage").innerHTML = renderConcept(index, c);
  $("feedback").textContent = message;
  const picked = read("survival-gallery-choice-v1");
  $("choice").textContent = picked ? `Your saved choice: ${picked}` : "No concept selected yet";
  ($("sim") as HTMLButtonElement).disabled = c.progress.complete || !c.available;
  ($("five") as HTMLButtonElement).disabled = c.progress.complete || !c.available;
  ($("finish") as HTMLButtonElement).disabled = c.progress.complete || !c.available;
  $("forfeit").hidden = !!c.available || c.progress.complete;
  const club = selected().squads.find((x) => x.teamId === clubId)!;
  $("injuries").textContent = run.injuries?.length
    ? run.injuries
        .map(
          (i) =>
            `${club.pool.find((p) => p.cardId === i.cardId)?.name ?? i.cardId}: ${i.remaining} fixture(s)`,
        )
        .join(" · ")
    : "No carried injuries";
  const rosterTeam = c.available ?? teams[run.coach];
  $("roster").innerHTML = rosterTeam.players
    .map(
      (p, j) =>
        `<label>${j + 1} · ${rosterTeam.formation.slots[j].role}<select data-slot="${j}" ${c.progress.complete ? "disabled" : ""}>${club.pool
          .filter((x) => canPlay(x, rosterTeam.formation.slots[j].role))
          .map(
            (x) =>
              `<option value="${esc(x.cardId)}" ${p.cardId === x.cardId ? "selected" : ""} ${run.injuries?.some((i) => i.cardId === x.cardId) || rosterTeam.players.some((q, k) => k !== j && q.playerId === x.playerId) ? "disabled" : ""}>${esc(x.name)} · ${x.ratings?.overall ?? 0}</option>`,
          )
          .join("")}</select></label>`,
    )
    .join("");
  if (grid) {
    $("year").innerHTML = data
      .map(
        (d, j) =>
          `<option value="${j}" ${j === yearIndex ? "selected" : ""}>${d.season}–${String(d.season + 1).slice(2)}</option>`,
      )
      .join("");
    $("club").innerHTML = candidates()
      .map(
        (c) =>
          `<option value="${c.id}" ${c.id === clubId ? "selected" : ""}>${esc(c.name)} · ${c.points} pts at takeover</option>`,
      )
      .join("");
    $("shape").innerHTML = club.formations
      .map((f) => `<option ${f === shape ? "selected" : ""}>${esc(f)}</option>`)
      .join("");
    $("grid").innerHTML = concepts
      .map(
        ([name, desc], j) =>
          `<button class="tile ${j === index ? "active" : ""}" data-concept="${j}" aria-label="Open ${j + 1}: ${esc(name)}"><div class="mini"><div class="mini-inner">${renderConcept(j, c)}</div></div><div class="tile-label"><b>${String(j + 1).padStart(2, "0")} / ${esc(name)}</b><span>${esc(desc)}</span></div></button>`,
      )
      .join("");
  }
}
$("grid").addEventListener("click", (e) => {
  const target = (e.target as Element).closest("[data-concept]") as HTMLElement | null;
  if (target) {
    choose(Number(target.dataset.concept));
    $("stage-heading").scrollIntoView({ block: "start" });
  }
});
$("sim").onclick = () => advance(1);
$("five").onclick = () => advance(5);
$("finish").onclick = () => advance(42);
$("forfeit").onclick = () => advance(1, true);
$("reset").onclick = reset;
$("prev").onclick = () => choose(index - 1);
$("next").onclick = () => choose(index + 1);
$("pick").onclick = () => {
  write(
    "survival-gallery-choice-v1",
    `${String(index + 1).padStart(2, "0")} / ${concepts[index][0]}`,
  );
  render();
};
$("year").onchange = (e) => {
  yearIndex = Number((e.target as HTMLSelectElement).value);
  reset();
};
$("club").onchange = (e) => {
  clubId = Number((e.target as HTMLSelectElement).value);
  reset();
};
$("shape").onchange = (e) => {
  shape = (e.target as HTMLSelectElement).value;
  reset();
};
$("toggle").onclick = () => {
  const g = $("grid");
  g.hidden = !g.hidden;
  $("toggle").textContent = g.hidden ? "Show all 30 concepts" : "Hide concept grid";
};
$("roster").onchange = (e) => {
  const el = e.target as HTMLSelectElement;
  const slot = Number(el.dataset.slot);
  if (!Number.isInteger(slot)) return;
  const base = context().available ?? teams[run.coach];
  const ids = base.players.map((p) => p.cardId);
  ids[slot] = el.value;
  try {
    teams[run.coach] = rotateSeasonTeam(
      base,
      selected().squads.find((c) => c.teamId === clubId)!.pool,
      ids,
      run.injuries,
    );
    message = "XI updated for future fixtures only.";
    persist();
  } catch {
    message = "That rotation cannot form a legal available XI.";
  }
  render();
};
try {
  const saved = JSON.parse(read("survival-gallery-run-v1") ?? "null");
  if (saved && saved.version === 1 && Number.isInteger(saved.yearIndex) && data[saved.yearIndex]) {
    yearIndex = saved.yearIndex;
    clubId = saved.clubId;
    shape = saved.shape;
    if (saved.archive !== archive()) throw Error("Archive changed");
    teams = classicTeams(selected(), clubId, shape, saved.cards);
    run = saved.run;
    const expected = survivalScenario(
      selected().schedule,
      selected().clubIds.indexOf(clubId),
      `${selected().season + 1}-01-01`,
      selected().table.find((r) => r.rank === selected().clubIds.length - 3)!.points + 1,
    );
    if (run.coach !== expected.coach || JSON.stringify(run.scenario) !== JSON.stringify(expected))
      throw Error("Campaign identity changed");
    survivalProgress(selected().schedule, run.scenario, run.results);
    message = "Campaign restored. Historical baseline and completed results are unchanged.";
    render(true);
  } else reset();
} catch {
  reset();
  message = "The gallery save was incompatible; started a new demo campaign.";
  render();
}
const picked = Number.parseInt(read("survival-gallery-choice-v1") ?? "", 10);
if (picked >= 1 && picked <= 30) choose(picked - 1);
const gallery = {
  choose,
  reset,
  advance,
  state: () => ({
    index,
    results: run.results.length,
    points: context().progress.own.points,
    remaining: context().progress.remaining.length,
    status: context().progress.status,
    cards: teams[run.coach].players.map((p) => p.cardId),
    storageAvailable,
  }),
  context,
};

export type GalleryContext = ReturnType<typeof context>;
declare global {
  interface Window {
    survivalGallery: typeof gallery;
  }
}
window.survivalGallery = gallery;
