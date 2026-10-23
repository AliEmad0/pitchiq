/* The 30 concepts. Each renders all three data states; `m` is the mobile frame. */
const hitRec = (r, inner, cls = "") => `<button class="hit ${cls}" data-act="s" data-v="r:${r.k}" aria-expanded="${sel("r:" + r.k)}">${inner}${recDet(r)}</button>`;
const hitMatch = (V, e, inner, cls = "") => `<button class="hit ${cls}" data-act="s" data-v="m:${e.id}" aria-expanded="${sel("m:" + e.id)}">${inner}${det(V.line(e), "m:" + e.id)}</button>`;
const matchLine = (e) => `${res(e.res)}<span class="num" style="font-weight:800">${e.gf}–${e.ga}</span>${crest(e.opp, 18)}<span class="clip">${esc(e.opp.name)}</span>`;
const logList = (V, m, n = 8, cls = "") => (V.list.length ? V.list.slice(0, m ? Math.min(n, 6) : n).map((e) => hitMatch(V, e, `<span class="row" style="flex-wrap:nowrap">${matchLine(e)}<span class="mut clip" style="margin-left:auto;font-size:12px">${esc(MODE[e.mode].emoji)} ${fmtDay(e.day)}</span></span>`, cls)).join("") : `<p class="mut">No matches in this mode yet.</p>`);
const modeRows = (V) => V.modes.filter((x) => x.p || x.best !== "—");

/* 1 */
C.push({ name: "Career Programme", idea: "A matchday-programme spread about the coach: cover band with crest, the eight records as a feature page, the season tables as 'previous meetings', the log as the fixture list.", render(V, m) {
  if (V.empty) return `<div class="p1-cover">${head(V, m)}</div>${empty(V)}`;
  return `<div class="p1-cover">${head(V, m)}<div class="p1-issue">ISSUE ${V.t.p} · CAREER EDITION</div></div>
  <div class="p1-feat">${V.recs.map((r) => hitRec(r, `<span class="p1-k">${r.label}</span><span class="p1-v num">${r.value}</span><span class="mut p1-s">${esc(r.sub)}</span>`, "p1-r")).join("")}</div>${sparseNote(V)}
  <h3 class="p1-h">Fixture list</h3>${tabs(V)}<div class="p1-log">${logList(V, m, 8, "p1-m")}</div>`;
} });
/* 2 */
C.push({ name: "Record Book Ledger", idea: "A ruled ledger: one line per record with a dotted leader to its value, then the match ledger with date, mode, opponent, score — the official book.", render(V, m) {
  const body = V.empty ? empty(V, "The book is blank", "Every full-time result is written in from your first match.") : `${V.recs.map((r) => hitRec(r, `<span class="row" style="flex-wrap:nowrap"><span>${r.label}</span><span class="p2-dots"></span><b class="num">${r.value}</b></span><span class="mut" style="font-size:12px">${esc(r.sub)}</span>`, "p2-line")).join("")}${sparseNote(V)}
  <h3 class="p2-h">Match ledger</h3>${tabs(V)}${V.list.slice(0, m ? 6 : 10).map((e) => hitMatch(V, e, `<span class="p2-cols num"><span>${fmtDay(e.day)}</span><span>${MODE[e.mode].emoji}</span><span class="clip">${esc(e.opp.name)}</span><span>${e.gf}–${e.ga}</span><span>${e.res}</span></span>`, "p2-line")).join("")}`;
  return `<div class="p2-book"><div class="p2-title">The Record Book · Coach ${esc(DATA.coach.name)}</div>${body}</div>`;
} });
/* 3 */
C.push({ name: "Stat Card Wall", idea: "Every record is its own card on a wall, biggest numbers biggest; tap one to flip its line open. The log sits beneath as a slim feed.", render(V, m) {
  if (V.empty) return head(V, m) + `<div style="height:12px"></div>` + empty(V);
  return `${head(V, m)}<div class="grid p3-wall">${V.recs.map((r, i) => hitRec(r, `<span class="p3-v num">${r.value}</span><span class="p3-k">${r.label}</span><span class="mut" style="font-size:12px">${esc(r.sub)}</span>`, `p3-card ${i < 2 ? "p3-hero" : ""}`)).join("")}</div>${sparseNote(V)}<div style="margin-top:14px">${tabs(V)}${logList(V, m, 6, "p3-m")}</div>`;
} });
/* 4 */
C.push({ name: "Career Timeline", idea: "A vertical timeline from your first match to today: runs as big milestones (finished 1st, survived, ladder title), matches as small ticks between them.", render(V, m) {
  if (V.empty) return `<div class="p4-line"><div class="p4-node p4-big"><b>Today</b><span class="mut">Your career starts with your first match.</span></div></div><button class="cta">Play a match</button>`;
  const items = [...V.runs.map((r) => ({ day: r.day, run: r })), ...V.chron.filter((e) => R.filter === "all" || e.mode === R.filter).map((e) => ({ day: e.day, e }))].sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, m ? 9 : 14);
  return `${head(V, m)}<div style="height:10px"></div>${tabs(V)}<div class="p4-line">${items.map((it) => it.run ? `<div class="p4-node p4-big"><b>${esc(it.run.title)}</b><span class="mut">${it.run.pos ? `${ord(it.run.pos)} of ${it.run.of} · ${it.run.pts} pts` : `${it.run.wins} wins in ${it.run.rounds} rounds`}${it.run.survived ? " · survived" : ""} · ${fmtDay(it.run.day)}</span></div>` : `<div class="p4-node">${hitMatch(V, it.e, `<span class="row" style="flex-wrap:nowrap">${matchLine(it.e)}<span class="mut" style="margin-left:auto;font-size:12px">${fmtDay(it.e.day)}</span></span>`)}</div>`).join("")}</div>${sparseNote(V)}`;
} });
/* 5 */
C.push({ name: "Broadcast Career Graphic", idea: "The full-screen TV graphic a broadcaster cuts to: red/yellow strap with the coach, big headline numbers in boxes, lower-third rows for each mode — the Ladder's Broadcast Scoreboard, career-wide.", render(V, m) {
  const strap = `<div class="p5-strap"><span class="p5-b">PITCHIQ</span><span>CAREER</span><span class="p5-n">COACH ${esc(DATA.coach.name).toUpperCase()}</span></div>`;
  if (V.empty) return strap + `<div style="height:12px"></div>` + empty(V, "Off air", "No career yet — your first full time goes to air here.");
  return `${strap}<div class="p5-big">${V.recs.slice(0, 4).map((r) => hitRec(r, `<span class="p5-v num">${r.value}</span><span class="p5-k">${r.label}</span>`, "p5-box")).join("")}</div>
  <div class="p5-rows">${modeRows(V).map((x) => `<div class="p5-row"><span>${x.emoji}</span><span class="clip">${esc(x.label)}</span><span class="num">${x.p ? `${x.w}-${x.d}-${x.l}` : ""}</span><span class="p5-best clip">${esc(x.best)}</span></div>`).join("")}</div>${sparseNote(V)}
  <div class="p5-tick">FORM ${form(V)}</div><div style="margin-top:10px">${tabs(V)}${logList(V, m, 5)}</div>`;
} });
/* 6 */
C.push({ name: "Trading Card Back", idea: "The coach as a trading card, flipped to its back: printed stat rows per mode, a career totals line, and the 'notable' box for the best record — the PlayerCard back, for you.", render(V, m) {
  const card = (inner) => `<div class="p6-card"><div class="p6-top">${coach(m ? 34 : 44)}<div><b>COACH ${esc(DATA.coach.name).toUpperCase()}</b><div class="p6-sub">CAREER CARD · No. ${String(V.t.p).padStart(3, "0")}</div></div></div>${inner}</div>`;
  if (V.empty) return card(`<div class="p6-blank">This card's back is blank — play a match to print your first stat line.</div><button class="cta">Play a match</button>`);
  return card(`<table class="p6-t num"><tr><th>MODE</th><th>P</th><th>W</th><th>D</th><th>L</th>${m ? "" : "<th>BEST</th>"}</tr>${modeRows(V).map((x) => `<tr><td>${x.emoji} ${m ? "" : esc(x.label)}</td><td>${x.p}</td><td>${x.w}</td><td>${x.d}</td><td>${x.l}</td>${m ? "" : `<td>${esc(x.best)}</td>`}</tr>`).join("")}<tr class="p6-tot"><td>CAREER</td><td>${V.t.p}</td><td>${V.t.w}</td><td>${V.t.d}</td><td>${V.t.l}</td>${m ? "" : `<td>${V.t.pct}% won</td>`}</tr></table>
  <div class="p6-note"><b>NOTABLE</b> ${V.recs.slice(1, 4).map((r) => hitRec(r, `${r.label}: <b>${r.value}</b> <span class="mut">${esc(r.sub)}</span>`)).join("")}</div>${sparseNote(V)}`) + `<div style="margin-top:12px">${tabs(V)}${logList(V, m, 5)}</div>`;
} });
/* 7 */
C.push({ name: "Arcade High Scores", idea: "The /game cabinet's own hi-score screen: neon marquee, one ranked table per record with the coach's initials, and an INSERT COIN empty state.", render(V, m) {
  const wrap = (x) => `<div class="p7-cab"><div class="p7-mq">★ HIGH SCORES ★</div>${x}</div>`;
  if (V.empty) return wrap(`<div class="p7-coin">NO SCORES YET<br><span>INSERT COIN — PLAY A MATCH</span></div>`);
  return wrap(`<div class="p7-tbl">${V.recs.map((r, i) => hitRec(r, `<span class="p7-rk">${i + 1}${["ST", "ND", "RD"][i] || "TH"}</span><span class="clip">${r.label.toUpperCase()}</span><span class="p7-sc num">${r.value}</span><span class="p7-in">${esc(DATA.coach.name.slice(0, 3).toUpperCase())}</span>`, "p7-row")).join("")}</div><div class="p7-form">${form(V)}</div>${tabs(V)}<div class="p7-log">${logList(V, m, 6)}</div>`);
} });
/* 8 */
C.push({ name: "Trophy Plaques", idea: "A museum wall of engraved brass plaques beside the Trophy Cabinet: each record a plaque with the date it was set; unset records hang as blank brass.", render(V, m) {
  return `${head(V, m)}<div class="grid p8-wall" style="margin-top:14px">${V.recs.map((r) => hitRec(r, `<span class="p8-k">${r.label.toUpperCase()}</span><span class="p8-v num">${r.value}</span><span class="p8-s">${esc(r.sub)}</span>`, `p8-plq ${r.value === "—" ? "p8-blank" : ""}`)).join("")}</div>${V.empty ? `<div style="margin-top:12px">${empty(V, "The plaques are blank", "Each one is engraved the day you set the record.")}</div>` : sparseNote(V) + `<div style="margin-top:14px">${tabs(V)}${logList(V, m, 6)}</div>`}`;
} });
/* 9 */
C.push({ name: "Sunday Almanac", idea: "A newspaper almanac page: masthead, the records as a column of 'facts and figures', the season tables as small print, the log as results in agate type.", render(V, m) {
  const mast = `<div class="p9-mast">THE PITCHIQ ALMANAC<span>Coach ${esc(DATA.coach.name)} · ${V.t.p} matches</span></div>`;
  if (V.empty) return `<div class="p9-paper">${mast}<p class="p9-lede">No edition yet. The almanac goes to press after your first full time.</p><button class="cta">Play a match</button></div>`;
  return `<div class="p9-paper">${mast}<div class="p9-cols"><div><h4>Facts &amp; figures</h4>${V.recs.map((r) => hitRec(r, `<b>${r.label}.</b> ${r.value} — ${esc(r.sub)}`, "p9-fact")).join("")}</div><div><h4>Results</h4>${tabs(V)}${V.list.slice(0, m ? 6 : 12).map((e) => hitMatch(V, e, `<span class="p9-agate">${fmtDay(e.day)} ${esc(e.opp.name)} ${e.gf}-${e.ga} (${e.res})</span>`)).join("")}</div></div>${sparseNote(V)}</div>`;
} });
/* 10 */
C.push({ name: "League Table of Modes", idea: "Your career as a league table where the 'clubs' are the modes: P W D L, win %, best finish — sortable at a glance; the records sit above as a summary strip.", render(V, m) {
  if (V.empty) return head(V, m) + `<div style="height:12px"></div>` + empty(V);
  const rows = modeRows(V).sort((a, b) => b.w / (b.p || 1) - a.w / (a.p || 1));
  return `${head(V, m)}<div class="p10-strip">${V.recs.slice(0, m ? 4 : 8).map((r) => hitRec(r, `<span class="mut" style="font-size:11px">${r.label}</span><b class="num">${r.value}</b>`, "p10-chip")).join("")}</div>
  <table class="p10-t num"><tr><th>#</th><th>Mode</th><th>P</th><th>W</th><th>D</th><th>L</th><th>%</th>${m ? "" : "<th>Best</th>"}</tr>${rows.map((x, i) => `<tr><td>${i + 1}</td><td>${x.emoji} ${m ? "" : esc(x.label)}</td><td>${x.p}</td><td>${x.w}</td><td>${x.d}</td><td>${x.l}</td><td>${x.p ? Math.round((x.w / x.p) * 100) : "–"}</td>${m ? "" : `<td>${esc(x.best)}</td>`}</tr>`).join("")}</table>${sparseNote(V)}<div style="margin-top:12px">${tabs(V)}${logList(V, m, 6)}</div>`;
} });
/* 11 */
C.push({ name: "Career Stock Ticker", idea: "The Stock Ticker valuation, applied to the career: a big 'win rate' price with a change badge, a bar per match (tap one), and gainers/losers become best and worst modes.", render(V, m) {
  if (V.empty) return `<div class="p11-term"><div class="p11-sym">PIQ:CAREER</div><div class="p11-px">—</div><p class="mut">No trading yet — the market opens with your first full time.</p><button class="cta">Play a match</button></div>`;
  const ms = V.chron.slice(-(m ? 20 : 40));
  const ranked = modeRows(V).filter((x) => x.p).sort((a, b) => b.w / b.p - a.w / a.p);
  return `<div class="p11-term"><div class="p11-sym">PIQ:CAREER · ${V.t.p} matches</div><div class="row"><span class="p11-px num">${V.t.pct}%</span><span class="p11-ch">${V.t.w}W ${V.t.d}D ${V.t.l}L</span></div>
  <div class="p11-bars">${ms.map((e) => `<button class="p11-bar ${e.res}" data-act="s" data-v="m:${e.id}" style="--h:${20 + (e.gf - e.ga + 4) * 10}%" aria-label="${esc(V.line(e))}"></button>`).join("")}</div>${(() => { const e = ms.find((x) => sel("m:" + x.id)); return e ? `<div class="det">${esc(V.line(e))}</div>` : `<div class="mut" style="font-size:11px">Tap a bar for the match</div>`; })()}
  <div class="p11-mv"><div><h4>Best modes</h4>${ranked.slice(0, 3).map((x) => `<div class="row"><span>${x.emoji}</span><span class="clip">${esc(x.label)}</span><b class="num" style="margin-left:auto;color:var(--up)">${Math.round((x.w / x.p) * 100)}%</b></div>`).join("")}</div><div><h4>Records</h4>${V.recs.slice(1, 5).map((r) => hitRec(r, `<span class="row"><span class="clip">${r.label}</span><b class="num" style="margin-left:auto">${r.value}</b></span>`)).join("")}</div></div>${sparseNote(V)}</div>`;
} });
/* 12 */
C.push({ name: "Teletext P302", idea: "Ceefax-style page 302 RECORDS: block colours, fixed-width rows, fastext buttons along the bottom act as the mode filter.", render(V, m) {
  const top = `<div class="p12-hd"><span>P302</span><span>PITCHIQ</span><span>RECORDS</span></div>`;
  if (V.empty) return `<div class="p12-tt">${top}<div class="p12-y">NO RECORDS ON THIS PAGE</div><div class="p12-c">PLAY A MATCH TO START YOUR CAREER</div></div>`;
  const used = new Set(V.log.map((e) => e.mode));
  const fx = [["all", "ALL", "r"], ...DATA.modes.filter((x) => used.has(x.id)).slice(0, 3).map((x, i) => [x.id, x.label.split(" ")[0].toUpperCase(), ["g", "y", "c"][i]])];
  return `<div class="p12-tt">${top}<div class="p12-y">COACH ${esc(DATA.coach.name).toUpperCase()} - CAREER</div>${V.recs.map((r) => hitRec(r, `<span class="p12-row"><span class="clip">${r.label.toUpperCase()}</span><span class="p12-c num">${r.value}</span></span>`)).join("")}<div class="p12-y" style="margin-top:6px">LATEST RESULTS</div>${V.list.slice(0, m ? 5 : 8).map((e) => hitMatch(V, e, `<span class="p12-row"><span class="clip">${esc(e.opp.name.toUpperCase())}</span><span class="num">${e.gf}-${e.ga} ${e.res}</span></span>`)).join("")}<div class="p12-fx">${fx.map(([v, l, c]) => `<button data-act="f" data-v="${v}" class="p12-${c}" aria-pressed="${R.filter === v}">${l}</button>`).join("")}</div></div>`;
} });
/* 13 */
C.push({ name: "Scouting Report", idea: "A clipboard dossier written about YOU: strengths (best records), weaknesses (worst mode, heaviest defeat), a typed form line — the Scout's Dossier turned on the coach.", render(V, m) {
  const clip = (x) => `<div class="p13-clip"><div class="p13-cl"></div><div class="p13-paper"><div class="p13-t">SCOUTING REPORT — COACH ${esc(DATA.coach.name).toUpperCase()}</div>${x}</div></div>`;
  if (V.empty) return clip(`<p>Subject has no recorded matches. Recommend: watch him play one.</p><button class="cta">Play a match</button>`);
  const worst = modeRows(V).filter((x) => x.p).sort((a, b) => a.w / a.p - b.w / b.p)[0];
  const heavy = V.log.filter((e) => e.ga > e.gf).sort((a, b) => b.ga - b.gf - (a.ga - a.gf))[0];
  return clip(`<h4>Strengths</h4>${V.recs.filter((r) => r.value !== "—").slice(0, 4).map((r) => hitRec(r, `✔ ${r.label}: <b>${r.value}</b> <span class="mut">${esc(r.sub)}</span>`, "p13-li")).join("")}
  <h4>Concerns</h4>${worst ? `<div class="p13-li">✘ Weakest in ${esc(worst.label)} (${worst.w}W ${worst.d}D ${worst.l}L)</div>` : ""}${heavy ? hitMatch(V, heavy, `✘ Heaviest defeat ${heavy.gf}–${heavy.ga} v ${esc(heavy.opp.name)}`, "p13-li") : ""}
  <h4>Recent form</h4><div class="row">${form(V)}</div>${sparseNote(V)}<h4>Match notes</h4>${tabs(V)}${logList(V, m, 5)}`);
} });
/* 14 */
C.push({ name: "Passport Stamps", idea: "A passport whose pages are the modes: every finished run is an ink stamp (rotated, dated); records sit on the photo page beside the coach crest.", render(V, m) {
  const photo = `<div class="p14-photo">${coach(m ? 48 : 64)}<div><div class="p14-lab">COACH</div><b>${esc(DATA.coach.name)}</b><div class="p14-lab" style="margin-top:6px">ISSUED</div>${V.chron[0] ? fmtDay(V.chron[0].day) : "—"}</div></div>`;
  if (V.empty) return `<div class="p14-pp">${photo}<div class="p14-page"><span class="mut">No stamps yet — every finished season, ladder week and Market run stamps a page.</span><br><button class="cta">Play a match</button></div></div>`;
  return `<div class="p14-pp">${photo}<div class="p14-recs">${V.recs.map((r) => hitRec(r, `<span class="p14-lab">${r.label}</span><b class="num">${r.value}</b>`, "p14-rec")).join("")}</div><div class="p14-page">${V.runs.map((r, i) => `<span class="p14-stamp" style="--r:${(i % 2 ? 1 : -1) * (4 + (i % 3) * 3)}deg"><b>${esc(MODE[r.mode].emoji)} ${r.pos ? ord(r.pos) : r.wins + "W"}</b><span>${esc(r.title)}</span><span>${fmtDay(r.day)}</span></span>`).join("") || `<span class="mut">Your first stamp comes when you finish a run.</span>`}</div></div>${sparseNote(V)}<div style="margin-top:12px">${tabs(V)}${logList(V, m, 5)}</div>`;
} });
/* 15 */
C.push({ name: "Heat Calendar", idea: "The daily hub's 28-day heat calendar, career-wide: one square per day shaded by matches played and coloured by results; tap a day for its matches. Records ride a rail above.", render(V, m) {
  if (V.empty) return head(V, m) + `<div style="height:12px"></div>` + empty(V);
  const days = []; for (let k = 0; k < 28; k++) days.push(new Date(Date.UTC(2026, 8, 26) + k * 864e5).toISOString().slice(0, 10));
  const by = (d) => V.log.filter((e) => e.day === d);
  return `${head(V, m)}<div class="p15-rail">${V.recs.slice(0, m ? 4 : 8).map((r) => hitRec(r, `<b class="num">${r.value}</b><span class="mut">${r.label}</span>`, "p15-chip")).join("")}</div>
  <div class="p15-cal">${days.map((d) => { const es = by(d); const w = es.filter((e) => e.res === "W").length; return `<button class="p15-day" data-act="s" data-v="d:${d}" style="--a:${Math.min(1, es.length / 3)};--c:${es.length ? (w * 2 >= es.length ? "var(--up)" : "var(--down)") : "var(--line)"}" aria-label="${d}: ${es.length} matches" aria-pressed="${sel("d:" + d)}"><span>${+d.slice(8)}</span></button>`; }).join("")}</div>
  ${(() => { const d = days.find((x) => sel("d:" + x)); if (!d) return `<p class="mut" style="font-size:12px">Tap a day.</p>`; const es = by(d); return es.length ? es.map((e) => `<div class="row" style="flex-wrap:nowrap;margin:4px 0">${matchLine(e)}<span class="mut" style="margin-left:auto;font-size:12px">${esc(e.ctx)}</span></div>`).join("") : `<p class="mut">No matches on ${fmtDay(d)}.</p>`; })()}${sparseNote(V)}`;
} });
/* 16 */
C.push({ name: "Form Guide", idea: "Built around form: a huge W/D/L strip of the last 20, the unbeaten record drawn as a bar against the current run, streak boxes for daily and ladder titles.", render(V, m) {
  if (V.empty) return `<div class="p16-big">— — — — —</div>` + empty(V, "No form yet");
  let cur = 0; for (const e of V.recent) { if (e.res === "L") break; cur++; }
  return `${head(V, m)}<div class="p16-strip">${V.recent.slice(0, m ? 10 : 20).map((e) => hitMatch(V, e, res(e.res), "p16-cell")).join("")}</div>${(() => { const e = V.recent.find((x) => sel("m:" + x.id)); return e ? `<div class="det">${esc(V.line(e))}</div>` : ""; })()}
  <div class="p16-bars"><div><span class="mut">Current unbeaten run</span><div class="p16-bar"><i style="--w:${(cur / Math.max(1, V.best)) * 100}%"></i><b class="num">${cur}</b></div></div><div><span class="mut">Record unbeaten run</span><div class="p16-bar"><i style="--w:100%"></i><b class="num">${V.best}</b></div></div></div>
  <div class="grid" style="margin-top:12px">${V.recs.slice(3).map((r) => hitRec(r, `<b class="num" style="font-size:22px">${r.value}</b><div class="mut" style="font-size:12px">${r.label}</div>`, "p16-box")).join("")}</div>${sparseNote(V)}`;
} });
/* 17 */
C.push({ name: "Locker Room Plates", idea: "A row of lockers, one per mode, each with its nameplate and a taped-on record card; open a locker (tap) to see that mode's matches.", render(V, m) {
  if (V.empty) return `<div class="p17-room">${DATA.modes.slice(0, m ? 4 : 7).map((x) => `<div class="p17-lk p17-shut"><span class="p17-np">${x.emoji} ${esc(x.label)}</span><span class="p17-tape">empty</span></div>`).join("")}</div>` + empty(V, "Every locker is empty");
  const rows = modeRows(V);
  return `${head(V, m)}<div class="p17-room">${rows.map((x) => `<button class="p17-lk ${R.filter === x.id ? "p17-open" : ""}" data-act="f" data-v="${R.filter === x.id ? "all" : x.id}"><span class="p17-np">${x.emoji} ${esc(x.label)}</span><span class="p17-tape"><b class="num">${x.p ? `${x.w}-${x.d}-${x.l}` : "—"}</b><br>${esc(x.best)}</span></button>`).join("")}</div>
  <div class="p17-shelf">${R.filter === "all" ? `<span class="mut">Open a locker for its matches.</span>` : logList(V, m, 6)}</div><div class="grid" style="margin-top:12px">${V.recs.map((r) => hitRec(r, `<span class="mut" style="font-size:11px">${r.label}</span><b class="num" style="display:block;font-size:20px">${r.value}</b>`, "p17-card")).join("")}</div>${sparseNote(V)}`;
} });
/* 18 */
C.push({ name: "Stadium Scoreboard", idea: "The big end-of-ground scoreboard: dot-matrix panels, HOME = you, a career 'score' of W–L, then rotating panels you step through with ◀ ▶ for each record.", render(V, m) {
  if (V.empty) return `<div class="p18-sb"><div class="p18-dm">PITCHIQ STADIUM</div><div class="p18-score num">0 – 0</div><div class="p18-dm">KICK-OFF WHEN YOU ARE READY</div></div><div style="text-align:center"><button class="cta">Play a match</button></div>`;
  const k = Math.max(0, V.recs.findIndex((r) => sel("r:" + r.k)));
  const r = V.recs[k], nx = V.recs[(k + 1) % V.recs.length], pv = V.recs[(k + V.recs.length - 1) % V.recs.length];
  return `<div class="p18-sb"><div class="p18-dm">COACH ${esc(DATA.coach.name).toUpperCase()} · CAREER</div><div class="p18-score num">${V.t.w} – ${V.t.l}</div><div class="p18-dm">WON · LOST · ${V.t.d} DRAWN</div>
  <div class="p18-panel"><button data-act="s" data-v="r:${pv.k}" aria-label="Previous record">◀</button><div><div class="p18-dm">${r.label.toUpperCase()}</div><div class="p18-v num">${r.value}</div><div class="p18-dm" style="font-size:11px">${esc(r.sub).toUpperCase()}</div></div><button data-act="s" data-v="r:${nx.k}" aria-label="Next record">▶</button></div><div class="p18-form">${form(V)}</div></div>${sparseNote(V)}<div style="margin-top:12px">${tabs(V)}${logList(V, m, 5)}</div>`;
} });
/* 19 */
C.push({ name: "Pitch Map", idea: "Records laid out on a pitch like a formation: the headline record up front, defensive records (unbeaten, survival) at the back — read the career like a team sheet.", render(V, m) {
  const spots = [[50, 14], [24, 34], [76, 34], [50, 46], [16, 66], [40, 70], [60, 70], [84, 66]];
  if (V.empty) return `<div class="p19-pitch"><div class="p19-msg">An empty team sheet. Your first match picks the side.</div></div><div style="text-align:center"><button class="cta">Play a match</button></div>`;
  const order = ["big", "pct", "daily", "season", "unb", "ladder", "market", "whatif"];
  return `${head(V, m)}<div class="p19-pitch" dir="ltr">${order.map((k, i) => { const r = V.recs.find((x) => x.k === k); return `<span class="p19-spot" style="left:${spots[i][0]}%;top:${spots[i][1]}%">${hitRec(r, `<span class="p19-disc num">${r.value}</span><span class="p19-lab">${r.label}</span>`)}</span>`; }).join("")}</div>${(() => { const r = V.recs.find((x) => sel("r:" + x.k)); return r && r.line ? `<div class="det">${esc(r.line)}</div>` : ""; })()}${sparseNote(V)}<div style="margin-top:12px">${tabs(V)}${logList(V, m, 5)}</div>`;
} });
/* 20 */
C.push({ name: "Dossier Folder Tabs", idea: "A manila folder with index tabs — Overview, then one tab per mode. Each tab's sheet has that mode's records and matches; Overview holds the career totals.", render(V, m) {
  const used = DATA.modes.filter((x) => V.log.some((e) => e.mode === x.id));
  const tb = `<div class="p20-tabs">${[["all", "Overview"], ...used.map((x) => [x.id, m ? x.emoji : `${x.emoji} ${x.label}`])].map(([v, l]) => `<button data-act="f" data-v="${v}" aria-pressed="${R.filter === v}">${esc(l)}</button>`).join("")}</div>`;
  if (V.empty) return `<div class="p20-f"><div class="p20-tabs"><button aria-pressed="true">Overview</button></div><div class="p20-sheet">${empty(V, "An empty file")}</div></div>`;
  const md = V.modes.find((x) => x.id === R.filter);
  return `<div class="p20-f">${tb}<div class="p20-sheet">${R.filter === "all" ? `${head(V, m)}<div class="grid" style="margin-top:12px">${V.recs.map((r) => hitRec(r, `<span class="mut" style="font-size:11px">${r.label}</span><b class="num" style="display:block;font-size:20px">${r.value}</b><span class="mut" style="font-size:11px">${esc(r.sub)}</span>`, "p20-card")).join("")}</div>` : `<h3 style="margin:0 0 6px">${md.emoji} ${esc(md.label)}</h3><p class="num"><b>${md.w}W ${md.d}D ${md.l}L</b> · best: ${esc(md.best)}</p>${logList(V, m, 8)}`}${sparseNote(V)}</div></div>`;
} });
/* 21 */
C.push({ name: "Hall Banners", idea: "Championship banners hanging from the rafters: one per finished run that won something (titles, survival, best Market run); the records are a banner row of their own.", render(V, m) {
  const won = V.runs.filter((r) => r.pos === 1 || r.survived || (r.mode === "market" && r === V.mk));
  if (V.empty) return `<div class="p21-rafters"><div class="p21-bn p21-ghost">YOUR FIRST BANNER</div></div>` + empty(V, "The rafters are bare");
  return `<div class="p21-rafters">${won.map((r) => `<div class="p21-bn"><span>${esc(MODE[r.mode].emoji)}</span><b>${r.pos === 1 ? "CHAMPIONS" : r.survived ? "SURVIVED" : `${r.wins} WINS`}</b><span class="p21-t">${esc(r.title)}</span></div>`).join("") || `<div class="p21-bn p21-ghost">YOUR FIRST BANNER</div>`}</div>
  ${head(V, m)}<div class="p21-recs">${V.recs.map((r) => hitRec(r, `<b class="num">${r.value}</b> <span class="mut">${r.label}</span>`, "p21-rec")).join("")}</div>${sparseNote(V)}<div style="margin-top:12px">${tabs(V)}${logList(V, m, 5)}</div>`;
} });
/* 22 */
C.push({ name: "Ticket Stubs", idea: "Every match is a torn ticket stub in a shoebox — date, fixture, score stamped on; record-setting matches have a gold stub. Records are printed on the box lid.", render(V, m) {
  if (V.empty) return `<div class="p22-lid">MATCH TICKETS</div><div class="p22-box"><span class="mut">The box is empty. Keep your first ticket.</span><br><button class="cta">Play a match</button></div>`;
  return `<div class="p22-lid">${V.recs.slice(0, m ? 3 : 6).map((r) => hitRec(r, `${r.label}: <b class="num">${r.value}</b>`, "p22-lidr")).join("")}</div>${tabs(V)}<div class="p22-box">${V.list.slice(0, m ? 6 : 12).map((e) => hitMatch(V, e, `<span class="p22-d">${fmtDay(e.day)}</span><span class="p22-m">${MODE[e.mode].emoji} ${esc(e.ctx.split(" · ")[0])}</span><span class="row" style="flex-wrap:nowrap">${matchLine(e)}</span>`, `p22-tk ${V.big && e.id === V.big.id ? "p22-gold" : ""}`)).join("")}</div>${sparseNote(V)}`;
} });
/* 23 */
C.push({ name: "Panini Record Pages", idea: "Album pages beside the Sticker Album: each record is a numbered sticker slot — filled with a shiny sticker once set, an empty outline with its number until then.", render(V, m) {
  return `<div class="p23-pg"><div class="p23-hd">${coach(30)}<b>RECORDS · PAGE 1</b><span class="mut">${V.recs.filter((r) => r.value !== "—").length}/${V.recs.length}</span></div><div class="grid p23-g">${V.recs.map((r, i) => r.value === "—" ? `<div class="p23-slot"><span class="p23-no">${i + 1}</span><span class="mut" style="font-size:11px">${r.label}</span></div>` : hitRec(r, `<span class="p23-no">${i + 1}</span><span class="p23-v num">${r.value}</span><span class="p23-k">${r.label}</span>`, "p23-stk")).join("")}</div></div>${V.empty ? `<div style="text-align:center;margin-top:10px"><span class="mut">Every slot is empty — play a match for your first sticker.</span><br><button class="cta">Play a match</button></div>` : sparseNote(V) + `<div style="margin-top:12px">${tabs(V)}${logList(V, m, 5)}</div>`}`;
} });
/* 24 */
C.push({ name: "Analyst Spreadsheet", idea: "The data person's view: a dense, column-headed match table with mode, date, opponent, score, result, goal difference — records as a frozen summary row on top.", render(V, m) {
  if (V.empty) return `<div class="p24-sum num">P 0 · W 0 · D 0 · L 0 · GF 0 · GA 0</div>` + empty(V, "0 rows");
  return `<div class="p24-sum num">P ${V.t.p} · W ${V.t.w} · D ${V.t.d} · L ${V.t.l} · GF ${V.t.gf} · GA ${V.t.ga} · ${V.t.pct}%</div><div class="p24-recs">${V.recs.map((r) => hitRec(r, `<span class="mut">${r.label}</span> <b class="num">${r.value}</b>`, "p24-rc")).join("")}</div>${tabs(V)}
  <table class="p24-t num"><tr><th>Date</th>${m ? "" : "<th>Mode</th>"}<th>Opponent</th><th>Score</th><th>R</th>${m ? "" : "<th>GD</th>"}</tr>${V.list.slice(0, m ? 10 : 16).map((e) => `<tr data-act="s" data-v="m:${e.id}" class="${sel("m:" + e.id) ? "p24-on" : ""}"><td>${fmtDay(e.day)}</td>${m ? "" : `<td>${esc(e.ctx)}</td>`}<td class="clip" style="max-width:${m ? 120 : 220}px">${esc(e.opp.name)}</td><td>${e.gf}–${e.ga}</td><td>${res(e.res)}</td>${m ? "" : `<td>${e.gf - e.ga > 0 ? "+" : ""}${e.gf - e.ga}</td>`}</tr>`).join("")}</table>${(() => { const e = V.list.find((x) => sel("m:" + x.id)); return e ? `<div class="det">${esc(V.line(e))}</div>` : ""; })()}${sparseNote(V)}`;
} });
/* 25 */
C.push({ name: "Milestone Track", idea: "A progress track of career milestones — 1st win, 10 matches, first title, 50 matches, 100 matches — ticked off with the day reached, the next one glowing; records below.", render(V, m) {
  const ms = [["First match", V.t.p >= 1], ["First win", V.t.w >= 1], ["10 matches", V.t.p >= 10], ["First title", V.ladder.titles + (V.bestSeason?.pos === 1 ? 1 : 0) > 0], ["25 wins", V.t.w >= 25], ["50 matches", V.t.p >= 50], ["100 matches", V.t.p >= 100]];
  const next = ms.findIndex((x) => !x[1]);
  return `${head(V, m)}<div class="p25-track">${ms.map(([l, d], i) => `<div class="p25-st ${d ? "p25-done" : i === next ? "p25-next" : ""}"><span class="p25-dot">${d ? "✓" : i + 1}</span><span class="p25-l">${l}</span></div>`).join("")}</div>${V.empty ? empty(V, "Milestone one: your first match") : `<div class="grid" style="margin-top:12px">${V.recs.map((r) => hitRec(r, `<b class="num" style="font-size:20px">${r.value}</b><div class="mut" style="font-size:11px">${r.label}</div>`, "p25-c")).join("")}</div>${sparseNote(V)}<div style="margin-top:12px">${tabs(V)}${logList(V, m, 5)}</div>`}`;
} });
/* 26 */
C.push({ name: "Mixtape Tracklist", idea: "A cassette J-card: side A is your greatest hits (record-setting matches), side B the full tracklist of recent results; the records are the liner notes.", render(V, m) {
  if (V.empty) return `<div class="p26-j"><div class="p26-t">COACH ${esc(DATA.coach.name).toUpperCase()} — CAREER MIX</div><p>Blank tape. Record your first match.</p><button class="cta">Play a match</button></div>`;
  const hits = [V.big, ...V.log.filter((e) => e.gf >= 3 && e.res === "W")].filter(Boolean).filter((e, i, a) => a.indexOf(e) === i).slice(0, 5);
  return `<div class="p26-j"><div class="p26-t">COACH ${esc(DATA.coach.name).toUpperCase()} — CAREER MIX · VOL ${Math.max(1, Math.ceil(V.t.p / 20))}</div><div class="p26-sides"><div><h4>SIDE A · GREATEST HITS</h4>${hits.map((e, i) => hitMatch(V, e, `<span class="p26-tr">${i + 1}. ${esc(e.opp.name)} ${e.gf}–${e.ga}</span>`)).join("") || `<span class="mut">No big wins yet.</span>`}</div><div><h4>SIDE B · LATEST</h4>${tabs(V)}${V.list.slice(0, m ? 5 : 8).map((e, i) => hitMatch(V, e, `<span class="p26-tr">${i + 1}. ${esc(e.opp.name)} ${e.gf}–${e.ga} ${e.res}</span>`)).join("")}</div></div><div class="p26-notes"><b>LINER NOTES</b> ${V.recs.map((r) => hitRec(r, `${r.label} ${r.value}`, "p26-n")).join(" · ")}</div>${sparseNote(V)}</div>`;
} });
/* 27 */
C.push({ name: "Medal Rack", idea: "A rack of medals on ribbons, one per record: gold once set, unpolished bronze outline when not. The ribbon colour is the mode; the number is engraved on the disc.", render(V, m) {
  return `${head(V, m)}<div class="p27-rack">${V.recs.map((r, i) => hitRec(r, `<span class="p27-rib" style="--c:${["#dc2626", "#2563eb", "#16a34a", "#ca8a04", "#7c3aed", "#0891b2", "#db2777", "#ea580c"][i]}"></span><span class="p27-disc num ${r.value === "—" ? "p27-off" : ""}">${r.value}</span><span class="p27-l">${r.label}</span>`, "p27-m")).join("")}</div>${V.empty ? empty(V, "No medals yet") : sparseNote(V) + `<div style="margin-top:12px">${tabs(V)}${logList(V, m, 5)}</div>`}`;
} });
/* 28 */
C.push({ name: "VHS Highlights Shelf", idea: "A shelf of VHS tapes, one per finished run, labelled in marker with its result; the record matches are 'highlights' tapes on top. Tap a tape for its line.", render(V, m) {
  if (V.empty) return `<div class="p28-shelf"><div class="p28-tape p28-blank">BLANK TAPE</div></div>` + empty(V, "Nothing taped yet");
  return `${head(V, m)}<div class="p28-shelf">${V.runs.map((r, i) => `<button class="p28-tape" data-act="s" data-v="t:${i}" aria-pressed="${sel("t:" + i)}"><span class="p28-lbl">${esc(r.title)}</span><b>${r.pos ? ord(r.pos) + " · " + r.pts + "pts" : r.wins + " wins"}</b></button>`).join("") || `<div class="p28-tape p28-blank">NO RUNS TAPED</div>`}</div>${(() => { const i = V.runs.findIndex((_, k) => sel("t:" + k)); const r = V.runs[i]; return r ? `<div class="det">${esc(r.title)} · ${fmtDay(r.day)}${r.w != null ? ` · ${r.w}W ${r.d}D ${r.l}L` : ""}</div>` : ""; })()}
  <div class="p28-hl">${V.recs.map((r) => hitRec(r, `<b class="num">${r.value}</b> ${r.label}`, "p28-h")).join("")}</div>${sparseNote(V)}<div style="margin-top:12px">${tabs(V)}${logList(V, m, 5)}</div>`;
} });
/* 29 */
C.push({ name: "Chalkboard Room", idea: "The dressing-room chalkboard: records chalked up in the coach's hand, the form guide as tally marks, the season finishes boxed — the TeamTalk pitch's world, but for the career.", render(V, m) {
  if (V.empty) return `<div class="p29-cb"><div class="p29-h">RECORDS</div><div class="p29-ch">(nothing chalked up yet)</div><div class="p29-ch">— play a match —</div></div>`;
  return `<div class="p29-cb"><div class="p29-h">RECORDS · COACH ${esc(DATA.coach.name).toUpperCase()}</div><div class="p29-cols"><div>${V.recs.map((r) => hitRec(r, `<span class="p29-ch">${r.label} — <u>${r.value}</u></span>`)).join("")}</div><div><div class="p29-ch">FORM: ${V.form.map((e) => e.res).join(" ")}</div><div class="p29-ch">TALLY: ${"卌 ".repeat(Math.floor(V.t.w / 5))}${"|".repeat(V.t.w % 5)} wins</div>${V.bestSeason ? `<div class="p29-box">${ord(V.bestSeason.pos)} · ${V.bestSeason.pts} PTS<br><small>${esc(V.bestSeason.title)}</small></div>` : ""}</div></div>${sparseNote(V)}<div style="margin-top:10px">${tabs(V)}${V.list.slice(0, m ? 5 : 8).map((e) => hitMatch(V, e, `<span class="p29-ch">${esc(e.opp.name)} ${e.gf}-${e.ga} ${e.res}</span>`)).join("")}</div></div>`;
} });
/* 30 */
C.push({ name: "Pocket Diary", idea: "A small, phone-first diary: one compact card with the three numbers that matter (win rate, biggest win, unbeaten), then a collapsible list per mode — the minimum, done well.", render(V, m) {
  if (V.empty) return `<div class="p30-card">${head(V, m)}<p class="mut">Nothing in the diary yet.</p><button class="cta">Play a match</button></div>`;
  return `<div class="p30-card">${head(V, m)}<div class="p30-three">${V.recs.slice(0, 3).map((r) => hitRec(r, `<b class="num">${r.value}</b><span class="mut">${r.label}</span>`, "p30-n")).join("")}</div><div class="row" style="margin-top:8px">${form(V, 8)}</div></div>${sparseNote(V)}
  ${modeRows(V).map((x) => `<details class="p30-d" ${R.filter === x.id || V.recent.some((e) => e.mode === x.id && sel("m:" + e.id)) ? "open" : ""}><summary><span>${x.emoji} ${esc(x.label)}</span><span class="mut num">${x.p ? `${x.w}-${x.d}-${x.l}` : ""} · ${esc(x.best)}</span></summary>${V.recent.filter((e) => e.mode === x.id).slice(0, 5).map((e) => hitMatch(V, e, `<span class="row" style="flex-wrap:nowrap">${matchLine(e)}<span class="mut" style="margin-left:auto;font-size:12px">${fmtDay(e.day)}</span></span>`, "p30-m")).join("") || `<span class="mut" style="font-size:12px">${esc(x.best)}</span>`}</details>`).join("")}
  <div class="grid" style="margin-top:10px">${V.recs.slice(3).map((r) => hitRec(r, `<b class="num">${r.value}</b> <span class="mut" style="font-size:11px">${r.label}</span>`, "p30-r")).join("")}</div>`;
} });
