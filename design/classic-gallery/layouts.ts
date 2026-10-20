export const concepts = [
  ["Parallel universes", "Two timelines diverge as you rewrite the same fixtures."],
  ["Season orbit", "Fixtures circle a central club crest like a season clock."],
  ["The Sunday edition", "Your season becomes a newspaper, with results as the headlines."],
  ["Inside the dugout", "A tactical pitch and touchline controls put the squad first."],
  ["Museum of what if", "Historical targets and your results hang as rival exhibits."],
  ["Teletext 303", "A full-screen football information service, rebuilt as a game."],
  ["The summit", "Climb a points mountain towards the real season’s final total."],
  ["Season ticket", "A giant match ticket advances a perforated strip of fixtures."],
  ["Road to May", "A winding board-game path turns each fixture into a destination."],
  ["Side A / Side B", "A record sleeve pairs the original season with your remix."],
  ["Next departure", "A station departure board makes the calendar the main interface."],
  ["The manager’s casefile", "Tabbed dossiers, evidence cards and a classified season brief."],
  ["Borrowed time", "A monumental hourglass measures matches played and matches left."],
  ["Wear the club", "A full-height supporter’s scarf anchors a bold fan-first layout."],
  ["The book of two seasons", "Facing pages place the historical record beside your own."],
  ["Mission control", "A circular instrument panel surrounds the next match command."],
  ["Dates with history", "A working calendar gives postponements and away trips their space."],
  ["The points exchange", "A live points ticker charts your lead or deficit against history."],
  ["The plinth", "A single monumental target dominates a gallery-like season screen."],
  ["The season line", "An underground-style route connects every home and away stop."],
  ["Extra time comic", "The season unfolds in illustrated editorial panels."],
  ["Deal the next match", "Fixtures become a fan of cards on a football card table."],
  ["Blueprint for a legacy", "A measured architectural drawing treats the season as a project."],
  ["The video wall", "A wall of broadcast monitors separates live results and the archive."],
  ["Matchday postcards", "Each fixture is a postcard, with results stamped into a travel journal."],
  ["The time machine", "Two date portals and a central lever move history forward."],
  ["The scoreboard cathedral", "Towering mechanical digits make points the whole stage."],
  ["The long ribbon", "A horizontal season panorama moves from the opening day to May."],
  ["A place at the table", "The league becomes a physical tiered podium you climb."],
  [
    "The final whistle",
    "An enormous match clock and editorial scoreline create a quiet, focused hub.",
  ],
];
const e = (v: any) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const tag = (s: string) => `<div class="tag">${s}</div>`;
const crest = (id: number, size = 55) =>
  `<img class="crest" alt="" width="${size}" height="${size}" src="/logos/${id}.png" onerror="this.style.visibility='hidden'">`;
const header = (c: any, title?: string) =>
  `<header class="ch">${tag(`CLASSIC / ${c.year}–${String(c.year + 1).slice(-2)}`)}<h1>${title || e(c.club)}</h1><p>${c.played} of ${c.total} fixtures · ${e(c.shape)}</p></header>`;
const actions = (c: any, label = "Sim fixture →") =>
  `<div class="actions"><button data-action="sim" ${c.complete ? "disabled" : ""}>${label}</button><button data-action="five" ${c.complete ? "disabled" : ""}>Advance 5</button><button data-action="reset">Restart</button></div>`;
const fixture = (c: any) =>
  `<div class="fixture-content">${tag(c.complete ? "SEASON COMPLETE" : `NEXT / ${c.date}`)}<h2>${c.opponent}</h2><p>${c.venue} · Historical score ${c.realScore}</p>${actions(c)}</div>`;
const compare = (c: any) =>
  `<div class="duel"><div><small>YOUR RUN</small><b>${c.points}</b></div><i>vs</i><div><small>THE REAL RUN</small><b>${c.history}</b></div></div><p class="delta">${c.delta > 0 ? "+" : ""}${c.delta} points · same ${c.played} fixtures</p>`;
const target = (c: any) =>
  `${tag("HISTORICAL FINISH")}<strong class="target-number">${c.target}</strong><p>points · ${c.rank}${c.rank === 1 ? "st" : c.rank === 2 ? "nd" : c.rank === 3 ? "rd" : "th"} place</p>`;
const table = (c: any, limit = 22) =>
  `<div class="table-wrap"><table><thead><tr><th>#</th><th>CLUB</th><th>P</th><th>GD</th><th>PTS</th></tr></thead><tbody>${c.table
    .slice(0, limit)
    .map(
      (r: any, i: number) =>
        `<tr class="${r.own ? "own" : ""}"><td>${i + 1}</td><td>${crest(r.id, 20)} ${e(r.name)}</td><td>${r.played}</td><td>${r.gd}</td><td><b>${r.points}</b></td></tr>`,
    )
    .join("")}</tbody></table></div>`;
const squad = (c: any) =>
  `<div class="squad-list">${c.squad.map((p: any) => `<div><small>${e(p.role)}</small><span>${e(p.name)}</span><b>${p.ovr}</b></div>`).join("")}</div>`;
const last = (c: any) =>
  `${tag("LATEST / YOUR RESULT")}<h2 class="last-score">${c.lastScore}</h2><p>Historical result: ${c.lastReal}</p>`;
const trail = (c: any) =>
  `<div class="trail">${c.fixtures.map((f: any, i: number) => `<span class="${i < c.played ? "done" : i === c.played ? "current" : ""}">${i + 1}<small>${f.side}</small></span>`).join("")}</div>`;
const box = (title: string, html: string, cls = "") =>
  `<section class="box ${cls}"><h3>${title}</h3>${html}</section>`;
const footer = (c: any) =>
  `<footer class="cf">${e(c.club)} / ${c.year} · ${c.leaguePlayed}/${c.leagueTotal} league matches completed · real match engine</footer>`;
function chart(c: any, kind = "lines") {
  const values = [0, ...c.cumulative.map((r: any) => r[0])],
    ghost = [0, ...c.cumulative.map((r: any) => r[1])];
  const max = Math.max(3, ...values, ...ghost),
    n = Math.max(c.total, 1);
  const line = (v: number[]) =>
    v.map((p, i) => `${35 + (i / n) * 730},${250 - (p / max) * 200}`).join(" ");
  return `<svg class="history-chart" viewBox="0 0 800 290" role="img" aria-label="Your points and historical points over completed fixtures"><path d="M35 30V250H780" fill="none" stroke="currentColor" opacity=".2"/>${[1, 2, 3].map((i) => `<path d="M35 ${250 - i * 60}H780" stroke="currentColor" opacity=".08"/>`).join("")}<polyline points="${line(ghost)}" fill="none" stroke="var(--ghost)" stroke-width="4" stroke-dasharray="8 7"/><polyline points="${line(values)}" fill="none" stroke="var(--accent)" stroke-width="5"/><text x="35" y="280" fill="currentColor" font-size="12">OPENING DAY</text><text x="695" y="280" fill="currentColor" font-size="12">FINAL DAY</text></svg>`;
}
const orb = (c: any) =>
  `<div class="orbit">${c.fixtures.map((f: any, i: number) => `<span class="orb-node ${i < c.played ? "done" : ""}" style="--angle:${(i / c.total) * 360}deg"><i>${i + 1}</i></span>`).join("")}<div class="orbit-core">${crest(c.id, 85)}<b>${c.points}</b><small>YOUR POINTS</small><p>${c.history} in history</p></div></div>`;
const pitch = (c: any) =>
  `<div class="tactic-pitch"><i class="half"></i><i class="centre"></i>${c.squad.map((p: any) => `<span style="left:${p.x}%;top:${p.y}%"><b>${p.ovr}</b><small>${e(p.name.split(" ").at(-1))}</small></span>`).join("")}</div>`;
const route = (c: any) =>
  `<div class="route-board">${c.fixtures.map((f: any, i: number) => `<div class="route-stop ${i < c.played ? "done" : i === c.played ? "current" : ""}"><b>${String(i + 1).padStart(2, "0")}</b><span>${f.side} / ${e(f.short)}</span></div>`).join("")}</div>`;
const departure = (c: any) =>
  `<div class="departure"><div class="departure-head"><span>DATE</span><span>DESTINATION</span><span>H/A</span><span>HISTORY</span></div>${c.fixtures
    .slice(c.played, c.played + 8)
    .map(
      (f: any, i: number) =>
        `<div class="${i === 0 ? "boarding" : ""}"><span>${f.date.slice(5)}</span><strong>${e(f.opponent)}</strong><span>${f.side}</span><span>${f.score}</span></div>`,
    )
    .join("")}</div>`;
const calendar = (c: any) => {
  const month = c.date.slice(0, 7),
    first = new Date(month + "-01T00:00:00Z"),
    offset = (first.getUTCDay() + 6) % 7,
    days = new Date(first.getUTCFullYear(), first.getUTCMonth() + 1, 0).getDate();
  return `<div class="calendar-title">${new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(first)}</div><div class="calendar">${["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => `<small>${d}</small>`).join("")}${Array.from({ length: offset }, () => '<div class="blank"></div>').join("")}${Array.from(
    { length: days },
    (_, i) => {
      const matches = c.fixtures.filter(
        (f: any) => f.date.slice(0, 10) === month + "-" + String(i + 1).padStart(2, "0"),
      );
      return `<div class="${matches.length ? "match-date" : ""}"><b>${i + 1}</b>${matches.map((f: any) => `<span>${f.side} / ${e(f.short)}</span><small>${f.score}</small>`).join("")}</div>`;
    },
  ).join("")}</div>`;
};
export function renderConcept(i: number, c: any) {
  let body = "";
  switch (i) {
    case 0:
      body = `${header(c, "One club. Two futures.")}<div class="universe-labels"><span>YOUR UNIVERSE <b>${c.points}</b></span><span>THE ARCHIVE <b>${c.history}</b></span></div>${chart(c)}<div class="parallel-bottom">${fixture(c)}${box("The divergence", `<strong class="giant">${c.delta > 0 ? "+" : ""}${c.delta}</strong><p>points away from history</p>`)}${box("League position", table(c, 5))}</div>`;
      break;
    case 1:
      body = `${header(c, "Around the season")}<div class="orbit-layout">${orb(c)}<aside>${fixture(c)}${box("The chase", compare(c))}</aside></div><div class="orbit-footer">${box("Season target", target(c))}${box("League", table(c, 5))}</div>`;
      break;
    case 2:
      body = `<div class="paper-top">THE FOOTBALL ARCHIVE <span>${c.year} / VOL. ${c.played + 1}</span></div><h1 class="newspaper-name">The ${e(c.club)} Chronicle</h1><div class="paper-line">SATURDAY EDITION <span>HISTORY IS STILL BEING WRITTEN</span> PRICE: ONE SEASON</div><div class="paper-columns"><article><h2 class="paper-headline">${c.delta >= 0 ? "A new history takes shape" : "Can the past be caught?"}</h2>${chart(c)}<p class="dropcap">${e(c.club)} have ${c.points} points from ${c.played} fixtures. The same matches brought the real side ${c.history}. The next chapter awaits.</p>${fixture(c)}</article><aside>${last(c)}<hr>${target(c)}</aside><aside><h3>THE LEAGUE WIRE</h3>${table(c)}</aside></div>`;
      break;
    case 3:
      body = `${header(c, "The touchline is yours.")}<div class="dugout">${pitch(c)}<aside class="clipboard">${tag("MANAGER’S BOARD")}${compare(c)}${fixture(c)}<div class="chalk-note">${c.total - c.played} matches to change the story.</div></aside></div><div class="bench-strip">${c.squad.map((p: any) => `<span>${e(p.name.split(" ").at(-1))}<b>${p.ovr}</b></span>`).join("")}</div>`;
      break;
    case 4:
      body = `${header(c, "The season that was. The season that could be.")}<div class="museum-wall"><div class="exhibit"><div class="gilt">${target(c)}</div><label>EXHIBIT A / THE HISTORICAL RECORD</label></div><div class="exhibit"><div class="gilt">${crest(c.id, 70)}<strong class="target-number">${c.points}</strong><p>points · ${c.played} fixtures</p></div><label>EXHIBIT B / YOUR REWRITE</label></div><div class="museum-note"><span>CURATOR’S NOTE</span><p>${c.delta >= 0 ? "Ahead of" : "Behind"} the archive by ${Math.abs(c.delta)} points at the same stage.</p></div></div><div class="museum-ticket">${fixture(c)}</div>`;
      break;
    case 5:
      body = `<div class="tele-head">P303 <b>PITCHIQ SPORT</b><span>${c.year}/${c.year + 1}</span></div><h1>CLASSIC FOOTBALL</h1><div class="tele-nav">303 SEASON / 304 FIXTURES / 305 SQUAD</div><div class="tele-columns"><div><h2>${e(c.club).toUpperCase()}</h2>${compare(c)}${fixture(c)}</div><div>${table(c)}</div></div><div class="tele-bottom"><span>RED: NEXT MATCH</span><span>GREEN: TABLE</span><span>YELLOW: HISTORY</span><span>BLUE: SQUAD</span></div>`;
      break;
    case 6:
      body = `${header(c, "The summit is history.")}<div class="summit"><svg viewBox="0 0 900 470" role="img" aria-label="Points climb towards the historical target"><path d="M0 450L170 310 280 360 570 55 900 450Z" fill="var(--panel)"/><path d="M60 430L210 335 300 350 420 245 470 210 570 55" stroke="var(--accent)" stroke-width="5" stroke-dasharray="10 8" fill="none"/><path d="M570 55V10L650 30 570 45" fill="var(--accent)"/><circle cx="${60 + Math.min(c.points / c.target, 1) * 510}" cy="${430 - Math.min(c.points / c.target, 1) * 375}" r="13" fill="var(--accent)"/><text x="665" y="65" fill="currentColor" font-size="55">${c.target}</text><text x="665" y="95" fill="currentColor">HISTORICAL POINTS</text></svg><div class="altitude"><strong>${c.points}</strong><span>POINTS CLIMBED</span><p>${c.history} at this point in history</p></div></div><div class="expedition">${fixture(c)}${box("Expedition log", last(c))}</div>`;
      break;
    case 7:
      body = `${header(c, "Your seat in history.")}<div class="ticket"><div class="ticket-main">${tag("PITCHIQ / SEASON ADMISSION")}<h2>${e(c.club)}</h2><div class="ticket-match">${c.opponent}</div><p>${c.date} / ${c.venue}</p>${actions(c, "Enter the next match →")}</div><div class="ticket-stub"><span>FIXTURE</span><b>${String(Math.min(c.played + 1, c.total)).padStart(2, "0")}</b><span>OF ${c.total}</span><div class="barcode"></div></div></div><div class="punch-row">${c.fixtures.map((_: any, j: number) => `<span class="${j < c.played ? "punched" : ""}">${j + 1}</span>`).join("")}</div><div class="ticket-bottom">${compare(c)}${box("The last ticket", last(c))}</div>`;
      break;
    case 8:
      body = `${header(c, "Road to May")}<div class="board-game"><div class="board-path">${c.fixtures.map((f: any, j: number) => `<div class="board-cell ${j < c.played ? "done" : j === c.played ? "current" : ""}"><b>${j + 1}</b><small>${f.side} / ${e(f.short)}</small>${j === c.played ? crest(c.id, 28) : ""}</div>`).join("")}</div><aside>${crest(c.id, 80)}${compare(c)}${fixture(c)}</aside></div>`;
      break;
    case 9:
      body = `${header(c, "The original. Your remix.")}<div class="record-player"><div class="sleeve">${crest(c.id, 70)}<h2>${e(c.club)}</h2><span>THE ${c.year} SESSIONS</span><div class="sleeve-score">${c.points}<small>POINTS / SIDE B</small></div></div><div class="vinyl"><div class="record-label">SIDE A<strong>${c.history}</strong><small>HISTORICAL POINTS</small></div></div></div><div class="record-controls"><span>TRACK ${c.played + 1} / ${c.total}</span>${fixture(c)}</div><div class="track-list">${trail(c)}</div>`;
      break;
    case 10:
      body = `<div class="station-head">${tag("CLASSIC CENTRAL")}<h1>Next departure</h1><span class="station-clock">${c.year}</span></div>${departure(c)}<div class="boarding-pass"><div>${crest(c.id, 55)}<h2>${e(c.club)}</h2><p>YOUR SEASON CONNECTION</p></div>${fixture(c)}<div>${compare(c)}</div></div>`;
      break;
    case 11:
      body = `<div class="folder-tabs"><span>01 / BRIEF</span><span>02 / EVIDENCE</span><span>03 / PERSONNEL</span></div><div class="case-file"><div class="case-title">${tag("MANAGER EYES ONLY")}<h1>Case ${c.year}:<br>${e(c.club)}</h1><span class="stamp">IN PROGRESS</span></div><div class="case-grid"><article>${fixture(c)}<div class="evidence">${compare(c)}</div></article><aside class="paper-note">${target(c)}${last(c)}</aside><div>${squad(c)}</div></div></div>`;
      break;
    case 12:
      body = `${header(c, "History won’t wait.")}<div class="hour-layout"><aside>${compare(c)}${target(c)}</aside><div class="hourglass"><svg viewBox="0 0 300 430" aria-hidden="true"><path d="M25 15H275M25 415H275" stroke="currentColor" stroke-width="20"/><path d="M50 30Q40 150 150 215Q40 280 50 400H250Q260 280 150 215Q260 150 250 30Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M65 55H235L150 200Z" fill="var(--accent)" opacity="${0.15 + (1 - c.played / c.total) * 0.8}"/><path d="M60 390L150 ${390 - (c.played / c.total) * 155}L240 390Z" fill="var(--accent)"/><path d="M150 210V330" stroke="var(--accent)" stroke-dasharray="3 6"/></svg><div><b>${c.total - c.played}</b><span>MATCHES LEFT</span></div></div><aside>${fixture(c)}</aside></div>`;
      break;
    case 13:
      body = `<div class="scarf-layout"><div class="scarf"><span>${c.year}</span>${crest(c.id, 90)}<h1>${e(c.club)}</h1><span>EVERY POINT IS OURS</span><div class="fringe"></div></div><div class="supporter-main">${tag("ONE CLUB / A DIFFERENT HISTORY")}<div class="supporter-points">${c.points}<span>OUR<br>POINTS</span></div><p>The real side had ${c.history} after these fixtures.</p>${fixture(c)}${trail(c)}</div><aside>${table(c)}</aside></div>`;
      break;
    case 14:
      body = `<div class="book-heading">THE BOOK OF TWO SEASONS / ${c.year}</div><div class="open-book"><article class="left-page">${tag("THE RECORDED SEASON")}<h1>What<br>happened.</h1><strong class="page-number">${c.history}</strong><p>points after the same ${c.played} fixtures</p>${target(c)}<span class="page-foot">THE ARCHIVE / ${e(c.club)}</span></article><article class="right-page">${tag("THE UNWRITTEN SEASON")}<h1>What<br>could happen.</h1><strong class="page-number">${c.points}</strong><p>your points so far</p>${fixture(c)}<span class="page-foot">YOUR STORY / CHAPTER ${c.played + 1}</span></article></div>`;
      break;
    case 15:
      body = `${header(c, "Season command")}<div class="command-room"><div class="instrument"><span>POINTS DELTA</span><div class="gauge"><b>${c.delta > 0 ? "+" : ""}${c.delta}</b></div><p>${c.points} YOU / ${c.history} ARCHIVE</p></div><div class="command-centre">${crest(c.id, 85)}${fixture(c)}</div><div class="instrument"><span>SEASON COMPLETION</span><div class="gauge" style="--progress:${(c.played / c.total) * 100}%"><b>${Math.round((c.played / c.total) * 100)}%</b></div><p>${c.played} / ${c.total} FIXTURES</p></div></div><div class="command-logs">${box("Telemetry", chart(c))}${box("League feed", table(c, 6))}</div>`;
      break;
    case 16:
      body = `${header(c, "Dates with history")}<div class="calendar-layout"><div>${calendar(c)}</div><aside>${fixture(c)}${box("At this date", compare(c))}${last(c)}</aside></div>`;
      break;
    case 17:
      body = `<div class="exchange-top">PITCHIQ / POINTS EXCHANGE <span>LIVE SEASON SIMULATION</span></div><div class="market-hero"><div><h1>${e(c.club)}</h1><strong>${c.delta > 0 ? "+" : ""}${c.delta}<small>PTS vs HISTORY</small></strong></div><div class="market-values"><span>YOUR RUN <b>${c.points}</b></span><span>HISTORICAL RUN <b>${c.history}</b></span><span>FINAL TARGET <b>${c.target}</b></span></div></div>${chart(c)}<div class="market-bottom">${fixture(c)}${table(c, 5)}</div>`;
      break;
    case 18:
      body = `${header(c, "Something to surpass.")}<div class="plinth-scene"><div class="monument"><span>THE HISTORICAL TARGET</span><strong>${c.target}</strong><div class="plinth">${e(c.club)} / ${c.year}</div></div><div class="visitor-label"><b>01 — The points record</b><p>Your run: ${c.points} points.<br>At the same fixtures: ${c.history}.</p>${fixture(c)}</div></div><div class="museum-progress">${trail(c)}</div>`;
      break;
    case 19:
      body = `<header class="metro-header"><div class="roundel">CLASSIC</div><div><h1>The season line</h1><p>${e(c.club)} · ${c.year} · ${c.total} stops</p></div></header>${route(c)}<div class="metro-platform"><span class="platform-number">${Math.min(c.played + 1, c.total)}</span>${fixture(c)}${compare(c)}</div>`;
      break;
    case 20:
      body = `<div class="comic-title">${e(c.club)}: REWRITE!</div><div class="comic-grid"><article class="comic-panel panel-a"><div class="caption">PREVIOUSLY, IN ${c.year}...</div>${crest(c.id, 100)}<div class="speech">The real team collected <b>${c.history}</b> points from these matches.</div></article><article class="comic-panel panel-b"><div class="burst">${c.points}<small>YOUR POINTS!</small></div><p class="caption">BUT THIS TIME, YOU’RE IN CHARGE.</p></article><article class="comic-panel panel-c">${last(c)}<div class="speech">${c.delta >= 0 ? "History has company." : "The comeback starts now."}</div></article><article class="comic-panel panel-d"><div class="caption">NEXT ISSUE...</div>${fixture(c)}</article></div>`;
      break;
    case 21:
      body = `${header(c, "Deal the next match.")}<div class="card-table"><div class="match-deck">${c.fixtures
        .slice(Math.min(c.played, c.total - 1), Math.min(c.played, c.total - 1) + 3)
        .map(
          (f: any, j: number) =>
            `<div class="playing-card" style="--r:${(j - 1) * 12}deg;--x:${j * 100}px"><span>${f.side}<b>${c.played + j + 1}</b></span>${crest(c.id, 60)}<h2>${e(f.opponent)}</h2><p>${f.date}</p><small>HISTORY ${f.score}</small></div>`,
        )
        .join(
          "",
        )}</div><aside class="card-score">${compare(c)}${actions(c, "Play the next card →")}<p>${c.total - c.played} fixtures left in the deck.</p></aside></div>`;
      break;
    case 22:
      body = `<div class="blueprint-title"><h1>Blueprint for a legacy</h1><span>DRAWING ${c.year}.01 / ${e(c.club)}</span></div><div class="blueprint-grid"><div class="plan-pitch">${pitch(c)}<span class="measure">← ELEVEN PLAYERS / ONE SEASON →</span></div><div class="plan-elevation">${tag("ELEVATION / POINTS")}${chart(c)}${compare(c)}</div><div class="spec-block">${fixture(c)}</div><div class="plan-stamp">${target(c)}</div></div>`;
      break;
    case 23:
      body = `<div class="wall-title"><span class="live-dot"></span> SEASON BROADCAST / ${e(c.club)}</div><div class="video-wall"><div class="monitor hero-monitor"><span class="channel">01 / LIVE</span><h1>${c.points}<small>YOUR POINTS</small></h1>${fixture(c)}</div><div class="monitor archive-monitor"><span class="channel">02 / ARCHIVE</span><h2>${c.history}</h2><p>HISTORICAL POINTS</p></div><div class="monitor squad-monitor"><span class="channel">03 / TEAM CAM</span>${pitch(c)}</div><div class="monitor table-monitor"><span class="channel">04 / LEAGUE FEED</span>${table(c, 6)}</div><div class="monitor score-monitor"><span class="channel">05 / HIGHLIGHTS</span>${last(c)}</div></div>`;
      break;
    case 24:
      body = `${header(c, "Postcards from a different season")}<div class="postcards"><article class="postcard front"><div class="postcard-picture">${crest(c.id, 90)}<h2>Greetings from<br>${e(c.club)}</h2></div><p>${c.year} / A SEASON TO REMEMBER</p></article><article class="postcard back"><div class="postal-stamp">${c.played + 1}<small>MATCHDAY</small></div><div class="handwritten">Dear history,<br>We have ${c.points} points.<br>You had ${c.history}.<br>There is more to write.</div><div class="address">NEXT DESTINATION<br><b>${c.opponent}</b><p>${c.date}</p></div></article></div><div class="postcard-action">${fixture(c)}</div>`;
      break;
    case 25:
      body = `${header(c, "Change the destination. Keep the date.")}<div class="time-machine"><div class="portal"><span>DESTINATION: HISTORY</span><strong>${c.history}</strong><small>POINTS / ${c.year}</small><p>THE RECORDED TIMELINE</p></div><div class="time-lever">${crest(c.id, 60)}<b>↔</b><span>${c.delta > 0 ? "+" : ""}${c.delta} PTS</span></div><div class="portal present"><span>DESTINATION: YOUR RUN</span><strong>${c.points}</strong><small>POINTS / ${c.year}</small><p>THE ALTERNATE TIMELINE</p></div></div><div class="time-console"><div class="date-readout">${c.date.replaceAll("-", " / ")}</div>${fixture(c)}</div>`;
      break;
    case 26:
      body = `<header class="cathedral-head">${e(c.club)}<span>THE ${c.year} SEASON</span></header><div class="scoreboard-cathedral"><div><span>YOU</span><strong>${String(c.points).padStart(2, "0")}</strong></div><i>:</i><div><span>HISTORY</span><strong>${String(c.history).padStart(2, "0")}</strong></div></div><div class="scoreboard-caption">THE SAME ${c.played} MATCHES. A ${Math.abs(c.delta)}-POINT DIFFERENCE.</div><div class="scoreboard-stage">${fixture(c)}<aside>${last(c)}</aside></div>`;
      break;
    case 27:
      body = `${header(c, "From August to possibility.")}<div class="ribbon-summary">${compare(c)}<span class="ribbon-target">THE FINISH / ${c.target} PTS</span></div><div class="season-panorama">${c.fixtures.map((f: any, j: number) => `<article class="panorama-frame ${j < c.played ? "done" : j === c.played ? "current" : ""}"><span>${String(j + 1).padStart(2, "0")}</span><small>${f.date.slice(5)}</small><h2>${e(f.opponent)}</h2><p>${f.side === "H" ? "At home" : "Away trip"}</p><b>${f.score}</b><small>HISTORICAL SCORE</small></article>`).join("")}</div><div class="ribbon-command">${fixture(c)}</div>`;
      break;
    case 28:
      body = `${header(c, "A place at the table.")}<div class="podium-layout"><div class="league-staircase">${c.table
        .slice(0, 10)
        .map(
          (r: any, j: number) =>
            `<div class="stair ${r.own ? "own" : ""}" style="--step:${j}"><b>${j + 1}</b>${crest(r.id, 28)}<span>${e(r.name)}</span><strong>${r.points}</strong></div>`,
        )
        .join("")}</div><aside><h2>Your climb</h2>${compare(c)}${fixture(c)}</aside></div>`;
      break;
    case 29:
      body = `<div class="whistle-layout"><div class="season-clock"><svg viewBox="0 0 400 400" aria-hidden="true"><circle cx="200" cy="200" r="170" fill="none" stroke="var(--line)" stroke-width="2"/>${Array.from({ length: 60 }, (_, j) => `<path d="M200 35V${j % 5 === 0 ? 55 : 43}" transform="rotate(${j * 6} 200 200)" stroke="currentColor" stroke-width="${j % 5 === 0 ? 3 : 1}"/>`).join("")}<path d="M200 200V75" transform="rotate(${(c.played / c.total) * 360} 200 200)" stroke="var(--accent)" stroke-width="5"/><circle cx="200" cy="200" r="7" fill="var(--accent)"/></svg><div><b>${c.played}</b><span>OF ${c.total}</span></div></div><article>${tag(`${e(c.club)} / ${c.year}`)}<h1>There’s still<br>time.</h1>${compare(c)}${fixture(c)}</article></div>`;
      break;
  }
  return `<div class="concept c${i}">${body}${footer(c)}</div>`;
}
