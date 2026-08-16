import type { DecisionAnswer } from "./match-decisions";

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
    if ((a.kind === "sub-offer" || a.kind === "dismissal") && a.off == null && a.on != null) {
      throw new Error("decision-tokens: an answer with `on` and no `off` is not encodable");
    }
    if (a.kind === "sub-offer" && a.reason != null) {
      throw new Error("decision-tokens: a sub `reason` cannot be carried by a share code");
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
        out.push(
          a.off == null ? "d" : a.on == null ? `d${b36(a.off)}` : `d${b36(a.off)}-${b36(a.on)}`,
        );
        break;
    }
  }
  flush();
  return out.join(SEP);
}
