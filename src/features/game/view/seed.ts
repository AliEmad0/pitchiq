/**
 * Pick a fresh match seed.
 *
 * The engine (TASK-1803) is deterministic from its seed and treats the seed as an
 * INPUT — it never reaches for entropy itself. Choosing that input is a view-layer
 * job, which is why this sits outside `domain/`.
 *
 * `/game/chaos` is `force-static`, so the prerendered HTML must be identical for
 * everyone; the caller keeps a fixed seed for the server render and swaps in a
 * random one after hydration.
 *
 * Spreads across the full uint32 space: `mulberry32` seeds close together produce
 * visibly similar early draws, so a narrow band would make consecutive drafts feel
 * alike.
 */
export function randomSeed(rand: () => number = Math.random): number {
  return Math.floor(rand() * 0x1_0000_0000) >>> 0;
}
