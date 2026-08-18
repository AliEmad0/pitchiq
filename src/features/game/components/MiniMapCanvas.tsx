"use client";
import { useEffect, useRef } from "react";
import { mulberry32 } from "@/features/game/domain/rng";
import {
  PITCH_X,
  PITCH_Y,
  type Actor,
  type MiniMapState,
  type SideSpec,
  aim,
  createState,
  passOn,
  penaltyScene,
  resetScene,
  shoot,
  step,
} from "@/features/game/domain/minimap";
import type { ViewEvent } from "@/features/game/view/match-view-model";

/** Seconds between passes while a move is building. */
const PASS_EVERY = 1.15;

/** Who is standing in a slot right now, or `null` where a dismissal left a gap. */
export interface Occupant {
  playerId: number;
  number: number;
}

export interface MiniMapSide {
  slots: SideSpec["slots"];
  /**
   * One entry per SLOT, in slot order — not a squad list.
   *
   * ⚠️ Slot-keyed on purpose. Built from the starting eleven instead, a substitute would
   * have no dot at all (he holds the slot his predecessor vacated, under a different
   * playerId) and his side would finish the match with ten.
   */
  players: readonly (Occupant | null)[];
  booked: readonly number[];
  captain: number | null;
}

interface Props {
  home: MiniMapSide;
  away: MiniMapSide;
  /** The match so far. Only events at or before `minute` are acted on. */
  events: readonly ViewEvent[];
  minute: number;
  seed: number;
  reduced: boolean;
  /**
   * False at full time.
   *
   * ⚠️ Without this the loop keeps running after the final whistle and the dots carry on
   * playing a match that has finished — reported straight from the preview.
   */
  running: boolean;
  label: string;
  /** Palette, read from the `.lg-root` tokens so the map cannot drift from the theme. */
  colors: {
    home: string;
    away: string;
    inkHome: string;
    inkAway: string;
    chalk: string;
    turfA: string;
    turfB: string;
  };
}

/**
 * TASK-1810 — the FIFA-style mini-map.
 *
 * ⚠️ The animation loop deliberately never touches React state. Driving 23 moving objects
 * through `useState` re-renders the whole subtree 60 times a second; the simulation lives
 * in a ref and paints straight to a canvas, so React only re-runs when the MINUTE changes.
 *
 * ⛔ Seeded, never `Math.random()`. Determinism is the game's core invariant.
 */
export function MiniMapCanvas({
  home,
  away,
  events,
  minute,
  seed,
  reduced,
  running,
  label,
  colors,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<MiniMapState | null>(null);
  const rngRef = useRef<() => number>(mulberry32(seed));
  const passClock = useRef(0);
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  // Build the simulation once. Actors are slot-shaped from here on: the sync effect below
  // keeps each dot's occupant current, so a substitution changes a NUMBER rather than
  // rebuilding the pitch and teleporting all 22 dots.
  if (stateRef.current == null) {
    const seedSide = (side: MiniMapSide, base: number): SideSpec => ({
      slots: side.slots,
      players: side.slots.map((_, i) => ({
        playerId: side.players[i]?.playerId ?? base + i,
        number: side.players[i]?.number ?? i + 1,
      })),
    });
    stateRef.current = createState(seedSide(home, 1_000), seedSide(away, 2_000));
  }

  /**
   * React to the CLOCK, not to every frame.
   *
   * The engine emits consequential events only — there is no pass or throw-in — so the
   * minute's event decides the shape of the next beat and the rAF loop fills the gaps
   * with a seeded pass chain that always travels toward the goal being attacked.
   */
  useEffect(() => {
    const s = stateRef.current;
    if (s == null) return;

    // Dismissals and substitutions, applied before anything is aimed. Slot order is
    // home 0..10 then away 0..10, exactly as `createState` built them.
    const perSide = home.slots.length;
    s.actors.forEach((a, i) => {
      const side = i < perSide ? home : away;
      const occ = side.players[i % perSide] ?? null;
      a.off = occ == null;
      if (occ != null) {
        a.playerId = occ.playerId;
        a.number = occ.number;
        a.booked = side.booked.includes(occ.playerId);
      }
    });

    const here = events.filter((e) => e.minute === minute);
    const next = events.filter((e) => e.minute === minute + 1);
    const goalHere = here.find((e) => e.kind === "goal" && e.side != null);
    const goalNext = next.find((e) => e.kind === "goal" && e.side != null);
    const penHere = here.find((e) => e.kind === "penalty" && e.side != null);

    if (penHere?.side != null) {
      s.possession = penHere.side;
      const taker = (penHere.side === "home" ? home : away).players[penHere.scorerSlot ?? 10];
      penaltyScene(s, taker?.playerId ?? -1);
      return;
    }

    if (goalHere?.side != null) {
      // ⭐ The shot hitting the net is what records the goal — the owner's rule. The side
      // is already in the opponent half by now, because the previous minute built up.
      s.scene = "open";
      s.possession = goalHere.side;
      const scorer = (goalHere.side === "home" ? home : away).players[goalHere.scorerSlot ?? 10];
      if (scorer != null) s.ball.carrier = scorer.playerId;
      shoot(s, rngRef.current, true);
      return;
    }

    if (goalNext?.side != null) {
      // Build up with the scoring side already carrying, so the goal reads as earned
      // rather than teleported.
      s.scene = "open";
      s.possession = goalNext.side;
      const squad = goalNext.side === "home" ? home : away;
      const carrier = squad.players[goalNext.scorerSlot ?? 10] ?? squad.players[10];
      if (carrier != null) s.ball.carrier = carrier.playerId;
      return;
    }

    if (minute === 0) {
      resetScene(s, "home");
      return;
    }

    // Ordinary play: alternate possession on a seeded coin so the map is never idle, and
    // make sure somebody is actually carrying.
    if (s.scene !== "open") s.scene = "open";
    if (s.ball.carrier == null && s.ball.flight == null) {
      const side = rngRef.current() < 0.5 ? "home" : "away";
      s.possession = side;
      const squad = side === "home" ? home : away;
      const pick = squad.players[3 + Math.floor(rngRef.current() * 7)] ?? squad.players[5];
      if (pick != null) s.ball.carrier = pick.playerId;
    }
  }, [minute, events, home, away]);

  // ---- the render loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const s = stateRef.current;
    if (canvas == null || s == null) return;
    const ctx = canvas.getContext("2d");
    if (ctx == null) return;

    let raf = 0;
    let last = 0;
    let stopped = false;

    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };

    const frame = (now: number) => {
      if (stopped) return;
      const dt = last === 0 ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;

      if (s.scene === "open") {
        aim(s);
        passClock.current += dt;
        if (passClock.current >= PASS_EVERY && s.ball.flight == null && s.ball.carrier != null) {
          passClock.current = 0;
          passOn(s, rngRef.current);
        }
      }
      step(s, dt);
      draw(ctx, canvas, s, colorsRef.current);
      raf = window.requestAnimationFrame(frame);
    };

    fit();
    if (reduced || !running) {
      // ⛔ No loop at all for a reduced-motion viewer, and none once the match is over:
      // the whistle has gone, so the pitch settles back into its shape and holds.
      if (!running) resetScene(s, s.possession);
      aim(s);
      step(s, 0);
      draw(ctx, canvas, s, colorsRef.current);
    } else {
      raf = window.requestAnimationFrame(frame);
    }

    const ro = new ResizeObserver(() => {
      fit();
      draw(ctx, canvas, s, colorsRef.current);
    });
    ro.observe(canvas);

    return () => {
      stopped = true;
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reduced, running]);

  const onPitch = (side: MiniMapSide): Occupant[] =>
    side.players.filter((p): p is Occupant => p != null);

  return (
    <div className="lg-map">
      <canvas ref={canvasRef} className="lg-map-canvas" role="img" aria-label={label} />
      {/* Canvas paints nothing a screen reader can use, so the same information rides
          alongside as text. */}
      <ul className="sr-only">
        {[home, away].map((side, i) =>
          onPitch(side).map((p) => (
            <li key={`${i}-${p.playerId}`}>
              {p.number}
              {side.captain === p.playerId ? " (C)" : ""}
              {side.booked.includes(p.playerId) ? " (booked)" : ""}
            </li>
          )),
        )}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------------- paint */

function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  s: MiniMapState,
  c: Props["colors"],
): void {
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return;
  const sx = w / PITCH_X;
  const sy = h / PITCH_Y;
  const X = (x: number) => x * sx;
  const Y = (y: number) => y * sy;
  const unit = Math.min(sx, sy);

  // ---- turf ----
  const bands = 12;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = i % 2 === 0 ? c.turfA : c.turfB;
    ctx.fillRect((i * w) / bands, 0, w / bands + 1, h);
  }

  // ---- markings ----
  ctx.strokeStyle = c.chalk;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = Math.max(1, unit * 0.25);
  ctx.strokeRect(X(1), Y(1), X(PITCH_X - 2), Y(PITCH_Y - 2));

  ctx.beginPath();
  ctx.moveTo(X(PITCH_X / 2), Y(1));
  ctx.lineTo(X(PITCH_X / 2), Y(PITCH_Y - 1));
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(X(PITCH_X / 2), Y(PITCH_Y / 2), unit * 9.15, 0, Math.PI * 2);
  ctx.stroke();

  // penalty areas + six-yard boxes, both ends
  const box = (fromX: number, depth: number, halfWidth: number) => {
    ctx.strokeRect(X(fromX), Y(PITCH_Y / 2 - halfWidth), X(depth) - X(0), Y(halfWidth * 2) - Y(0));
  };
  box(1, 16.5, 20.15);
  box(PITCH_X - 1 - 16.5, 16.5, 20.15);
  box(1, 5.5, 9.16);
  box(PITCH_X - 1 - 5.5, 5.5, 9.16);

  ctx.globalAlpha = 0.6;
  for (const spot of [11, PITCH_X / 2, PITCH_X - 11]) {
    ctx.beginPath();
    ctx.fillStyle = c.chalk;
    ctx.arc(X(spot), Y(PITCH_Y / 2), Math.max(1, unit * 0.35), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ---- players ----
  const r = unit * 1.55;
  for (const a of s.actors) {
    if (a.off) continue;
    drawActor(ctx, a, X(a.pos.x), Y(a.pos.y), r, c);
  }

  // ---- the ball, with its shadow ----
  const bx = X(s.ball.pos.x);
  const by = Y(s.ball.pos.y);
  // The shadow stays on the turf while the ball lifts, which is what sells the height.
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse(bx, by + s.ball.z * unit * 0.35, r * 0.42, r * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(bx, by - s.ball.z * unit * 0.35, r * (0.4 + s.ball.z * 0.03), 0, Math.PI * 2);
  ctx.fill();
}

function drawActor(
  ctx: CanvasRenderingContext2D,
  a: Actor,
  x: number,
  y: number,
  r: number,
  c: Props["colors"],
): void {
  const fill = a.side === "home" ? c.home : c.away;
  const ink = a.side === "home" ? c.inkHome : c.inkAway;

  // A pressing player gets a ring, so the duel is visible at a glance.
  if (a.state === "pressing") {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = fill;
    ctx.lineWidth = Math.max(1, r * 0.28);
    ctx.beginPath();
    ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // A booking rides on the DOT, not only in the feed and the team sheet.
  if (a.booked) {
    ctx.strokeStyle = "#ffc63d";
    ctx.lineWidth = Math.max(1, r * 0.3);
    ctx.beginPath();
    ctx.arc(x, y, r * 1.24, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = ink;
  ctx.font = `700 ${Math.round(r * 1.1)}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(a.number), x, y + r * 0.05);
}
