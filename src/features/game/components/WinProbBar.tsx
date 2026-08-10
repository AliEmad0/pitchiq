import type { WinProbability } from "@/features/game/domain/win-probability";
import { GlowPulse } from "./GlowPulse";

interface Props {
  prob: WinProbability;
  title: string;
  homeAbbr: string;
  awayAbbr: string;
  drawLabel: string;
  ariaLabel: string;
  pulseKey: number;
}

export function WinProbBar({
  prob,
  title,
  homeAbbr,
  awayAbbr,
  drawLabel,
  ariaLabel,
  pulseKey,
}: Props) {
  const pct = (n: number) => Math.round(n * 100);
  const d = (n: number) => pct(n);
  // Below this width the "NN%" would clip/cramp, so drop the inline label (#4).
  const MIN_LABEL_PCT = 12;
  const label = (n: number) => (pct(n) >= MIN_LABEL_PCT ? `${d(n)}%` : "");
  return (
    <div role="group" aria-label={ariaLabel} className="rounded-md bg-[#06140d]/95 p-2 text-white">
      <div className="mb-1.5 font-mono text-[10px] font-bold tracking-widest text-[#c7d2c9]">
        {title}
      </div>
      <div className="relative flex h-4 overflow-hidden rounded">
        <span
          className="grid place-items-center overflow-hidden bg-[linear-gradient(#37b96a,#268a4f)] text-[11px] font-bold tabular-nums"
          style={{ flexBasis: `${pct(prob.home)}%` }}
        >
          {label(prob.home)}
        </span>
        <span
          className="grid place-items-center overflow-hidden bg-[#5b636d] text-[11px] font-bold tabular-nums"
          style={{ flexBasis: `${pct(prob.draw)}%` }}
        >
          {label(prob.draw)}
        </span>
        <span
          className="grid place-items-center overflow-hidden bg-[linear-gradient(#d61b38,#a30f28)] text-[11px] font-bold tabular-nums"
          style={{ flexBasis: `${pct(prob.away)}%` }}
        >
          {label(prob.away)}
        </span>
        <GlowPulse key={pulseKey} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-[#aeb8b0]">
        <span>{homeAbbr}</span>
        <span>{drawLabel}</span>
        <span>{awayAbbr}</span>
      </div>
    </div>
  );
}
