import { localizeDigits } from "@/utils/format";
import { GlowPulse } from "./GlowPulse";

interface Props {
  homeAbbr: string;
  awayAbbr: string;
  home: number;
  away: number;
  minute: number;
  liveLabel: string;
  ariaLabel: string;
  locale: string;
  pulseKey: number;
}

export function Scoreboard({
  homeAbbr,
  awayAbbr,
  home,
  away,
  minute,
  liveLabel,
  ariaLabel,
  locale,
  pulseKey,
}: Props) {
  const d = (n: number) => localizeDigits(n, locale);
  return (
    <div role="group" aria-label={ariaLabel} className="relative flex items-stretch gap-2 text-white">
      <div className="relative flex items-stretch overflow-hidden rounded-md text-sm font-extrabold shadow-lg">
        <span className="bg-primary grid place-items-center px-2 py-1 tabular-nums">{homeAbbr}</span>
        <span className="grid place-items-center bg-[#06140d] px-2 tabular-nums text-[#f6c000]">{d(home)}</span>
        <span className="grid place-items-center bg-[#06140d] px-2 tabular-nums">{d(away)}</span>
        <span className="grid place-items-center bg-[#20242b] px-2">{awayAbbr}</span>
        <GlowPulse key={pulseKey} />
      </div>
      <div className="flex items-center gap-1.5 rounded-md bg-[#06140d]/90 px-2 font-mono text-xs font-bold">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#ff4b4b]" />
        <span className="text-[#ff4b4b]">{liveLabel}</span>
        <span className="tabular-nums">
          {d(minute)}
          {"'"}
        </span>
      </div>
    </div>
  );
}
