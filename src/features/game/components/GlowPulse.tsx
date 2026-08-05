/** An inset overlay that plays the Glow Pulse once; give it a changing `key` to replay. */
export function GlowPulse() {
  return (
    <span aria-hidden="true" className="pitch-glow pointer-events-none absolute inset-0 z-10" />
  );
}
