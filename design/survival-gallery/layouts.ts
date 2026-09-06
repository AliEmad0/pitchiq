import type { GalleryContext } from "./main";
export const concepts = [
  ["The Lifeline", "Climb from the danger zone to the safety line."],
  ["Deadline", "The remaining calendar is the main event."],
  ["The War Room", "Put your actual XI at the heart of the rescue."],
  ["Last Train", "A horizontal journey through the final fixtures."],
  ["The Cliff Edge", "One sharp boundary separates safety from relegation."],
  ["The Run-In Race", "Track the clubs around you on parallel lanes."],
  ["The Back Page", "A newspaper tells the story of your escape."],
  ["The Boardroom", "A board mandate, a points account, and a deadline."],
  ["Under the Lights", "A stadium scoreboard built for the next match."],
  ["The Rival", "You versus the club occupying the safety position."],
  ["Rescue Route", "A winding route with each fixture as a checkpoint."],
  ["The Manager's Diary", "Dated match cards and a working squad notebook."],
  ["The Points Bank", "Earn the points that fill your season's account."],
  ["Pressure Gauge", "An instrument panel for the size of the task."],
  ["The Tunnel", "A focused walk toward the next fixture."],
  ["Mission Control", "A central objective surrounded by league intelligence."],
  ["The Case File", "A dossier of the club, the evidence, and the assignment."],
  ["Page 302", "A compact teletext survival desk, with the whole table."],
  ["The Grandstand", "Every earned point fills a seat in the home end."],
  ["Clear for Landing", "Remaining fixtures lead down a runway to safety."],
  ["Night Navigation", "Fixtures become a constellation of opportunities."],
  ["The Touchline", "A tall tactical strip beside a large live league view."],
  ["Two Futures", "See the points benchmark and league position side by side."],
  ["The Ascent", "A climb toward the season's points summit."],
  ["Safety Interchange", "A transit map connects you, your rivals, and the line."],
  ["Nine Signals", "Nine distinct readouts tell the story at a glance."],
  ["The Dressing Room", "Real players lead; results and the table support them."],
  ["The Pit Wall", "Narrow telemetry columns for a fast run through the season."],
  ["Borrowed Time", "An hourglass holds the fixtures you still have left."],
  ["The Final Act", "A cinematic match bill above a full-width survival table."],
];
export const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[x]!,
  );
export function renderConcept(i: number, c: GalleryContext) {
  const n = c.progress.own.points,
    t = c.target,
    left = c.progress.remaining.length,
    pct = Math.min(100, (n / t) * 100);
  const rows = c.table.slice(-7);
  const head = `<div class="identity">${c.logo(c.clubId)}<div><small>${c.year} / SURVIVAL</small><h2>${esc(c.club)}</h2></div></div>`;
  const metric = (label: string, value: unknown, detail = "") =>
    `<div class="metric"><small>${label}</small><strong>${value}</strong><span>${detail}</span></div>`;
  const points = () => metric("POINTS", n, `${Math.max(0, t - n)} to the benchmark`);
  const target = () => metric("BENCHMARK", t, "Historical safety points + 1");
  const remaining = () => metric("FIXTURES LEFT", left, "Actual chronological schedule");
  const rank = () =>
    metric(
      "LEAGUE POSITION",
      `${c.progress.position}<em>/${c.table.length}</em>`,
      c.progress.position <= c.progress.safePlaces ? "Above the line" : "In the relegation places",
    );
  const table = (full = false) =>
    `<section class="table"><div class="block-label">THE LEAGUE <span>PTS / GD</span></div>${(full ? c.table : rows).map((r) => `<div class="row ${r.own ? "own" : ""} ${r.rank === c.progress.safePlaces + 1 ? "line" : ""}"><b>${r.rank}</b>${c.logo(r.id)}<span>${esc(r.name)}</span><strong>${r.points}</strong><small>${r.goalDifference}</small></div>`).join("")}</section>`;
  const next = () =>
    `<section class="next"><small>${esc(c.nextDate)} · ${c.venue}</small><h3>${i === 0 && c.opponentId != null ? c.logo(c.opponentId) : ""}${esc(c.opponent)}</h3><span>${left ? "Your next opportunity" : "Campaign complete"}</span></section>`;
  const fixtures = () =>
    `<div class="fixtures">${
      c.fixtures
        .slice(0, 6)
        .map(
          (f, j: number) =>
            `<div><b>${String(j + 1).padStart(2, "0")}</b><span class="fixture-team">${i === 0 ? c.logo(f.id) : ""}<span>${esc(f.name)}</span></span><small>${f.date.slice(5)} · ${f.venue}</small></div>`,
        )
        .join("") || "<p>No fixtures remain</p>"
    }</div>`;
  const squad = () =>
    `<div class="players">${c.squad.map((p) => `<article><span class="shirt">${p.role}</span><div><b>${esc(p.name)}</b><small>${p.injury ? "OUT · " + p.injury + " fixture(s)" : p.ovr + " OVR"}</small></div></article>`).join("")}</div>`;
  const rail = () =>
    `<div class="rail">${c.fixtures.map((f, j: number) => `<div><i>${j + 1}</i><b>${esc(f.name)}</b><small>${f.venue} · ${f.date.slice(5)}</small></div>`).join("") || "<p>End of the line</p>"}</div>`;
  const bar = () =>
    `<div class="bar"><span style="width:${pct}%"></span></div><div class="bar-label"><b>${n} earned</b><span>${t} benchmark</span></div>`;
  const pitch = () =>
    `<div class="pitch"><div class="centre"></div>${c.squad.map((p) => `<div class="pin ${p.injury ? "injured" : ""}" style="left:${p.x}%;top:${p.y}%"><b>${p.ovr}</b><span>${esc(p.name.split(" ").at(-1))}</span></div>`).join("")}</div>`;
  const rivals = () =>
    `<div class="lanes">${rows.map((r) => `<div class="lane ${r.own ? "selected" : ""}"><span>${esc(r.name)}</span><div><b style="left:${Math.min(90, (r.points / Math.max(...rows.map((x) => x.points), 1)) * 90)}%">${r.points}</b></div></div>`).join("")}</div>`;
  const stamp = `<div class="stamp">${c.progress.complete ? c.progress.status.toUpperCase() : c.progress.targetMet ? "TARGET REACHED · KEEP GOING" : "THE GREAT ESCAPE"}<small>Final league position decides survival</small></div>`;
  const dial = () =>
    `<div class="dial" style="--p:${pct}%"><div><strong>${Math.max(0, t - n)}</strong><small>POINTS TO TARGET</small></div></div>`;
  const cells = () =>
    `<div class="seats">${Array.from({ length: t }, (_, j) => `<i class="${j < n ? "filled" : ""}">${j + 1}</i>`).join("")}</div>`;
  const note = `<p class="note">You took over on 1 January. Earlier results are historical. Every later fixture uses the real match engine.</p>`;
  let body = "";
  switch (i) {
    case 0:
      body = `<div class="split thirds"><div class="tower"><div class="water" style="height:${pct}%"></div><strong>${n}</strong><small>POINTS</small><b>SAFETY BENCHMARK ${t}</b></div><div>${head}${next()}${fixtures()}</div><div>${rank()}${table()}</div></div>`;
      break;
    case 1:
      body = `${head}<div class="deadline">${remaining()}<div>${next()}${bar()}</div></div><div class="calendar">${fixtures()}</div><div class="strip">${points()}${rank()}${target()}</div>`;
      break;
    case 2:
      body = `<div class="war"><aside>${head}${points()}${target()}${next()}</aside>${pitch()}<aside>${rank()}${table()}</aside></div>`;
      break;
    case 3:
      body = `<div class="strip">${head}${points()}${remaining()}</div><h1>LAST TRAIN<br>TO SAFETY.</h1>${rail()}<div class="split"><div>${next()}${bar()}</div>${table()}</div>`;
      break;
    case 4:
      body = `<div class="cliff"><div>${head}<strong class="hero-number">${c.progress.position}</strong><h3>${c.progress.position <= c.progress.safePlaces ? "ABOVE THE EDGE" : "BELOW THE LINE"}</h3></div><div class="edge"></div><div>${target()}${points()}${next()}</div></div>${table()}`;
      break;
    case 5:
      body = `${head}<div class="split"><div><h1>THE RUN-IN<br>IS A RACE.</h1>${rivals()}</div><aside>${next()}${points()}${remaining()}${stamp}</aside></div>`;
      break;
    case 6:
      body = `<div class="newspaper"><div class="masthead">THE SURVIVAL POST <small>JANUARY EDITION · ${c.year + 1}</small></div><h1>${esc(c.club).toUpperCase()}:<br>THE GREAT ESCAPE?</h1><div class="columns"><div>${head}${note}${next()}</div><div>${dial()}${stamp}</div><div>${table()}</div></div></div>`;
      break;
    case 7:
      body = `<div class="board"><div class="memo"><small>PRIVATE / MANAGER'S MANDATE</small><h1>KEEP US<br>UP.</h1>${head}${note}</div><div>${target()}${bar()}${remaining()}${next()}</div></div><div class="strip">${rank()}${points()}${stamp}</div>`;
      break;
    case 8:
      body = `<div class="scoreboard">${head}<div><strong>${n}</strong><span>POINTS<br>ON THE BOARD</span><strong>${t}</strong><span>THE<br>BENCHMARK</span></div>${stamp}</div><div class="split"><div>${next()}${fixtures()}</div>${table()}</div>`;
      break;
    case 9:
      body = `${head}<div class="duel"><div>${c.logo(c.clubId)}<h2>${esc(c.club)}</h2>${points()}</div><span class="versus">VS<br><small>THE LINE</small></span><div>${c.logo(c.safe.id)}<h2>${esc(c.safe.name)}</h2>${metric("SAFETY POSITION", c.safe.points, "Current campaign table")}</div></div><div class="split">${next()}${fixtures()}</div>${bar()}`;
      break;
    case 10:
      body = `<div class="split narrow"><aside>${head}${dial()}${next()}</aside><div class="route-map">${c.fixtures
        .slice(0, 9)
        .map(
          (f, j: number) =>
            `<div style="margin-left:${[0, 24, 48, 24][j % 4]}%"><i>${j + 1}</i><b>${esc(f.name)}</b><small>${f.date.slice(5)}</small></div>`,
        )
        .join("")}</div></div>`;
      break;
    case 11:
      body = `<div class="diary"><aside>${head}<h1>THE<br>RUN-IN<br>DIARY.</h1>${points()}${stamp}</aside><div>${next()}${fixtures()}${note}</div><aside>${squad()}</aside></div>`;
      break;
    case 12:
      body = `<div class="split"><div>${head}<h1>EVERY POINT<br>COUNTS.</h1>${cells()}${bar()}</div><aside>${target()}${remaining()}${next()}${table()}</aside></div>`;
      break;
    case 13:
      body = `${head}<div class="gauges">${rank()}${dial()}${remaining()}</div><div class="split">${table()}<div>${next()}${bar()}${stamp}</div></div>`;
      break;
    case 14:
      body = `<div class="tunnel"><div class="wall left"></div><div class="tunnel-content">${head}<small>STEP OUT. CHANGE THE SEASON.</small>${next()}<div class="strip">${points()}${remaining()}</div>${stamp}</div><div class="wall right"></div></div>`;
      break;
    case 15:
      body = `<div class="mission"><header>${head}${stamp}</header><aside>${table()}</aside><div class="mission-core">${dial()}${next()}</div><aside>${remaining()}${rank()}${fixtures()}</aside></div>`;
      break;
    case 16:
      body = `<div class="dossier"><header>CASE ${c.year} / ${String(c.clubId).padStart(3, "0")}<span>OPEN: SURVIVAL</span></header><div class="split"><div>${head}<h1>THE<br>ASSIGNMENT.</h1>${target()}${note}</div><div>${next()}${rank()}${bar()}</div></div><div class="split">${squad()}${table()}</div></div>`;
      break;
    case 17:
      body = `<div class="teletext"><header>P302 &nbsp; PITCHIQ &nbsp; ${c.year + 1} &nbsp; SURVIVAL</header><div class="strip">${head}${points()}${remaining()}</div>${table(true)}<footer>${esc(c.opponent)} &nbsp; / &nbsp; BENCHMARK ${t}</footer></div>`;
      break;
    case 18:
      body = `<div class="grandstand">${head}<div class="stadium"><h1>GIVE THEM<br>SOMETHING TO BELIEVE IN.</h1>${cells()}${bar()}</div><div class="strip">${next()}${remaining()}${rank()}</div></div>`;
      break;
    case 19:
      body = `<div class="landing"><aside>${head}${points()}${remaining()}${next()}</aside><div class="runway"><b>SAFE FINISH</b>${c.fixtures
        .slice(0, 8)
        .map(
          (f, j: number) =>
            `<div style="width:${50 + j * 6}%"><span>${esc(f.name)}</span><i>${j + 1}</i></div>`,
        )
        .join("")}</div><aside>${table()}</aside></div>`;
      break;
    case 20:
      body = `${head}<div class="constellation"><svg viewBox="0 0 900 340" aria-hidden="true"><path d="M70 210 L190 100 L320 250 L450 80 L590 170 L720 70 L830 230"/></svg>${c.fixtures
        .slice(0, 7)
        .map(
          (f, j: number) =>
            `<div style="left:${8 + j * 13}%;top:${[62, 30, 73, 24, 50, 20, 68][j]}%"><b>${j + 1}</b><span>${esc(f.name)}</span></div>`,
        )
        .join("")}</div><div class="strip">${points()}${remaining()}${rank()}${next()}</div>`;
      break;
    case 21:
      body = `<div class="touchline"><aside>${head}${points()}${remaining()}${target()}${stamp}</aside><div>${table(true)}</div><aside>${next()}${pitch()}</aside></div>`;
      break;
    case 22:
      body = `${head}<div class="futures"><div><small>THE MILESTONE</small><h1>${Math.max(0, t - n)} POINTS<br>TO TARGET.</h1>${bar()}${target()}</div><div><small>THE REAL OBJECTIVE</small><h1>FINISH<br>ABOVE ${c.progress.safePlaces + 1}.</h1>${rank()}${table()}</div></div>${next()}`;
      break;
    case 23:
      body = `${head}<div class="mountain"><svg viewBox="0 0 900 330" aria-hidden="true"><path d="M0 325L170 260L250 290L410 140L500 180L690 25L900 325Z"/></svg><div class="summit">${t}<small>BENCHMARK</small></div><div class="climber" style="left:${15 + pct * 0.45}%">${n} PTS</div></div><div class="strip">${remaining()}${rank()}${next()}</div>${bar()}`;
      break;
    case 24:
      body = `<div class="transit"><aside>${head}${target()}${next()}</aside><div><h1>SAFETY<br>INTERCHANGE.</h1>${rows.map((r) => `<div class="station ${r.own ? "own" : ""}"><i></i><b>${esc(r.name)}</b><span>${r.points} pts · ${r.rank}th</span></div>`).join("")}</div><aside>${remaining()}${points()}${stamp}</aside></div>`;
      break;
    case 25:
      body = `${head}<div class="signals">${points()}${remaining()}${rank()}<div>${next()}</div><div class="signal-main">${dial()}</div><div>${target()}</div><div>${bar()}</div><div>${stamp}</div><div>${metric("TAKEOVER", "01 JAN", String(c.year + 1))}</div></div>`;
      break;
    case 26:
      body = `${head}<h1>THE MEN WHO<br>CAN KEEP US UP.</h1><div class="dressing">${c.squad
        .map(
          (p) =>
            `<article><div class="portrait">${p.name
              .split(" ")
              .map((s: string) => s[0])
              .slice(0, 2)
              .join("")}</div><b>${esc(p.name)}</b><span>${p.role} · ${p.ovr}</span></article>`,
        )
        .join("")}</div><div class="strip">${points()}${remaining()}${next()}</div>${bar()}`;
      break;
    case 27:
      body = `${head}<div class="pitwall"><div class="telemetry">${points()}${bar()}${target()}</div><div>${remaining()}${fixtures()}</div><div>${rank()}${table()}</div><div class="telemetry">${next()}${stamp}${note}</div></div>`;
      break;
    case 28:
      body = `<div class="hourglass-layout"><aside>${head}${points()}${next()}</aside><div class="hourglass"><svg viewBox="0 0 200 300" aria-hidden="true"><path d="M20 15H180L108 145V155L180 285H20L92 155V145Z"/></svg><strong>${left}</strong><span>FIXTURES<br>REMAIN</span></div><aside>${target()}${bar()}${rank()}${fixtures()}</aside></div>`;
      break;
    default:
      body = `<div class="final-act"><small>ACT II / THE SURVIVAL SEASON</small>${head}<h1>${left} FIXTURES.<br>ONE WAY OUT.</h1><div class="strip">${next()}${points()}${rank()}</div></div>${table()}${bar()}`;
  }
  return `<article class="concept concept-${i}" data-layout="${i}">${body}</article>`;
}
