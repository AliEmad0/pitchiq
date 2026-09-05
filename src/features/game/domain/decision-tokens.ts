import type { DecisionAnswer, MatchDecision } from "./match-decisions";

/**
 * TASK-1812 — the coach's decisions as a compact, self-validating token stream.
 *
 * A token says only WHAT was chosen. `minute`, `side` and `kind` are recoverable from the
 * replay itself: for a given `(setup, seed)` the engine raises the same decisions in the
 * same order, and `createStream` surfaces only the coach's, so the nth token answers the
 * nth coach decision.
 *
 * That is not merely shorter than a verbatim `DecisionAnswer[]` — a match raises ~31 coach
 * decisions, because `SUB_WINDOW` is 55'–85' and a `sub-offer` is raised every minute of
 * it, so the verbatim form runs past 210 characters where this runs to about 15. The
 * property that matters more is that it is CHECKABLE: a token whose kind disagrees with
 * the decision actually being raised proves the code is stale, tampered with, or from a
 * drifted build, and we can say so before rendering anything. A verbatim array cannot make
 * that check — it would be fed to the generator and quietly produce a different match.
 *
 * Every character used is URL-unreserved, so a share link never percent-encodes.
 */

const NOOP = "-";
const SEP = "~";

/** An upper bound on a run, so a hostile code cannot ask for a billion no-ops. */
const MAX_RUN = 200;

const b36 = (n: number) => Math.trunc(n).toString(36);

const unb36 = (s: string): number | null => {
  if (!/^[0-9a-z]+$/.test(s)) return null;
  const n = parseInt(s, 36);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};

const RESPONSE_TOKEN = { overload: "o", stabilize: "z", hold: "h" } as const;

const RESPONSE_CHOICE = { o: "overload", z: "stabilize", h: "hold" } as const;

/**
 * Encode the coach's answers, in the order the engine asked.
 *
 * Throws only on programmer error — callers build this from their own live match, never
 * from external input. Both throws exist for one reason: a code must never be able to
 * carry an instruction the engine would silently drop.
 */
export function encodeTokens(answers: readonly DecisionAnswer[]): string {
  const out: string[] = [];
  let run = 0;
  const flush = () => {
    if (run === 0) return;
    out.push(run === 1 ? NOOP : `${NOOP}${b36(run)}`);
    run = 0;
  };

  for (const a of answers) {
    if (a.kind === "sub-offer" && a.changes?.length) {
      throw new Error("decision-tokens: grouped substitutions require a different share format");
    }
    if ((a.kind === "sub-offer" || a.kind === "dismissal") && a.off == null && a.on != null) {
      throw new Error("decision-tokens: an answer with `on` and no `off` is not encodable");
    }
    if (a.kind === "sub-offer" && a.reason != null) {
      throw new Error("decision-tokens: a sub `reason` cannot be carried by a share code");
    }
    if (a.kind === "dismissal" && a.inGoal != null && (a.off != null || a.on != null)) {
      throw new Error("decision-tokens: a dismissal cannot both substitute and reassign");
    }

    // Only a sub-offer no-op is run-length encoded; a dismissal no-op is a different kind
    // and must stay distinguishable.
    if (a.kind === "sub-offer" && a.off == null) {
      run++;
      continue;
    }
    flush();

    switch (a.kind) {
      case "sub-offer":
        out.push(a.on == null ? `s${b36(a.off!)}` : `s${b36(a.off!)}-${b36(a.on)}`);
        break;
      case "response":
        out.push(RESPONSE_TOKEN[a.choice]);
        break;
      case "injury-sub":
        out.push(a.on == null ? "i" : `i${b36(a.on)}`);
        break;
      case "dismissal":
        // `g` is its OWN head, not a third field on `d`. A dismissal either substitutes or
        // reassigns, and separate heads make a stream that tries to do both ungrammatical
        // rather than merely odd — which is the property that lets a tampered code be
        // refused instead of replayed into a different, plausible match.
        out.push(
          a.inGoal != null
            ? `g${b36(a.inGoal)}`
            : a.off == null
              ? "d"
              : a.on == null
                ? `d${b36(a.off)}`
                : `d${b36(a.off)}-${b36(a.on)}`,
        );
        break;
    }
  }
  flush();
  return out.join(SEP);
}

export type NextAnswer =
  | { ok: true; answer: DecisionAnswer }
  | { ok: false; reason: "exhausted" | "mismatch" };

export interface TokenReader {
  /** Answer the decision the engine is raising now. */
  next(decision: MatchDecision): NextAnswer;
  /**
   * Every token consumed?
   *
   * ⚠️ Leftovers matter. A stream carrying MORE answers than the engine now raises
   * decisions means the match changed shape underneath the code — the same condition the
   * resume path has always rejected outright.
   */
  done(): boolean;
}

/**
 * Parse a token stream.
 *
 * ⛔ Returns null for an ungrammatical one rather than throwing — this runs on a value a
 * stranger controls, during a render.
 *
 * Grammar is checked up front, per token, so a malformed stream fails as a bad CODE before
 * any match is assembled. Whether a token FITS the decision it will answer can only be
 * known during the replay, and is reported as `mismatch` there.
 */
export function readTokens(encoded: string): TokenReader | null {
  const raw = encoded === "" ? [] : encoded.split(SEP);
  const flat: string[] = [];

  for (const tok of raw) {
    if (tok === NOOP) {
      flat.push(NOOP);
      continue;
    }
    if (tok.startsWith(NOOP)) {
      const n = unb36(tok.slice(1));
      if (n === null || n < 2 || n > MAX_RUN) return null;
      for (let i = 0; i < n; i++) flat.push(NOOP);
      continue;
    }
    if (!/^[szoihdg][0-9a-z-]*$/.test(tok)) return null;
    if (!wellFormed(tok)) return null;
    flat.push(tok);
  }

  let i = 0;
  return {
    next(decision) {
      if (i >= flat.length) return { ok: false, reason: "exhausted" };
      const answer = materialise(flat[i++]!, decision);
      return answer === null ? { ok: false, reason: "mismatch" } : { ok: true, answer };
    },
    done: () => i >= flat.length,
  };
}

/** Is this token well-formed on its own, ignoring which decision it will answer? */
function wellFormed(tok: string): boolean {
  const head = tok[0]!;
  const rest = tok.slice(1);
  const pair = (s: string, required: boolean): boolean => {
    if (s === "") return !required;
    const [a, b] = s.split("-");
    if (unb36(a ?? "") === null) return false;
    return b === undefined || unb36(b) !== null;
  };
  if (head === "s") return pair(rest, true);
  if (head === "d") return pair(rest, false);
  if (head === "i") return rest === "" || unb36(rest) !== null;
  // An emergency keeper is always a specific player: `g` alone says nothing.
  if (head === "g") return unb36(rest) !== null;
  return rest === "";
}

/**
 * Turn one token into an answer for the decision being raised.
 *
 * ⚠️ `minute` and `side` come from the DECISION, never from the token — that is what makes
 * a token this short. Null means the token's kind is not the decision's kind.
 */
function materialise(tok: string, d: MatchDecision): DecisionAnswer | null {
  const base = { minute: d.minute, side: d.side };
  const head = tok[0]!;
  const rest = tok.slice(1);

  if (head === NOOP || head === "s") {
    if (d.kind !== "sub-offer") return null;
    if (head === NOOP) return { kind: "sub-offer", ...base };
    const [offRaw, onRaw] = rest.split("-");
    const off = unb36(offRaw ?? "");
    if (off === null) return null;
    if (onRaw === undefined) return { kind: "sub-offer", ...base, off };
    const on = unb36(onRaw);
    return on === null ? null : { kind: "sub-offer", ...base, off, on };
  }
  if (head === "o" || head === "z" || head === "h") {
    if (d.kind !== "response") return null;
    return { kind: "response", ...base, choice: RESPONSE_CHOICE[head] };
  }
  if (head === "i") {
    if (d.kind !== "injury-sub") return null;
    if (rest === "") return { kind: "injury-sub", ...base };
    const on = unb36(rest);
    return on === null ? null : { kind: "injury-sub", ...base, on };
  }
  if (head === "g") {
    if (d.kind !== "dismissal") return null;
    const inGoal = unb36(rest);
    return inGoal === null ? null : { kind: "dismissal", ...base, inGoal };
  }
  if (head === "d") {
    if (d.kind !== "dismissal") return null;
    if (rest === "") return { kind: "dismissal", ...base };
    const [offRaw, onRaw] = rest.split("-");
    const off = unb36(offRaw ?? "");
    if (off === null) return null;
    if (onRaw === undefined) return { kind: "dismissal", ...base, off };
    const on = unb36(onRaw);
    return on === null ? null : { kind: "dismissal", ...base, off, on };
  }
  return null;
}
