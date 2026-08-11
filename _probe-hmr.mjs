import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const log = [];
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(2).padStart(7);

function attach(page, tag) {
  page.on("console", (m) => {
    const t = m.text();
    if (t.includes("Fast Refresh") || t.includes("HMR") || t.includes("Refreshing")) {
      log.push(`${stamp()} [${tag}] ${t.slice(0, 120)}`);
    }
  });
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) log.push(`${stamp()} [${tag}] NAV -> ${f.url()}`);
  });
}

const browser = await chromium.launch();
const ctx = await browser.newContext();

const tab1 = await ctx.newPage();
attach(tab1, "tab1");
await tab1.goto(`${BASE}/players`, { waitUntil: "load" });
log.push(`${stamp()} [tab1] loaded /players`);

// PHASE 1 — idle. No other traffic. Does HMR churn on its own?
await tab1.waitForTimeout(15000);
log.push(`${stamp()} ===== PHASE 1 (idle 15s) done =====`);

// PHASE 2 — a second tab hits routes tab1 never touched, forcing on-demand
// compiles in the dev server. Does tab1 see Fast Refresh events?
const tab2 = await ctx.newPage();
attach(tab2, "tab2");
for (const route of ["/map", "/managers", "/leaderboards", "/compare", "/game"]) {
  await tab2.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  log.push(`${stamp()} [tab2] visited ${route}`);
}
await tab1.waitForTimeout(3000);
log.push(`${stamp()} ===== PHASE 2 (other-route compiles) done =====`);

// PHASE 3 — with churn possibly in flight, try the exact failing interaction:
// click a player row link on tab1 and see whether the URL ever changes.
const before = tab1.url();
const link = tab1.locator('table a[href^="/players/"]').first();
await link.click();
let changed = false;
for (let i = 0; i < 60; i++) {
  await tab1.waitForTimeout(200);
  if (tab1.url() !== before) { changed = true; break; }
}
log.push(`${stamp()} [tab1] click nav ${changed ? "SUCCEEDED -> " + tab1.url() : "NEVER CHANGED (still " + tab1.url() + ")"}`);

console.log(log.join("\n"));
console.log("\nFast Refresh events on tab1:", log.filter((l) => l.includes("[tab1]") && l.includes("Fast Refresh")).length);
await browser.close();
