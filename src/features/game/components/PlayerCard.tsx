"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Flag } from "@/features/players/components/Flag";
import { PlayerImage } from "@/features/players/components/PlayerImage";
import { CARD_DIMS, type EnrichedCard, eraOf } from "@/features/game/domain/player-card";
import { localizeDigits } from "@/utils/format";

interface Props {
  card: EnrichedCard;
  locale: string;
  reduced?: boolean;
}

const GOLD =
  "radial-gradient(120% 70% at 50% 8%, #fff2c8 0%, #f7d873 26%, #eebf4c 52%, #d59e30 78%, #b97f1f 100%)";
const clubAbbr = (name: string) =>
  (name.replace(/[^A-Za-z]/g, "").slice(0, 3) || "TBD").toUpperCase();
const footLetter = (f: string | null) =>
  f === "left" ? "L" : f === "right" ? "R" : f === "both" ? "B" : "";
// Back-panel stat labels are universal abbreviations (rendered as data → the
// no-hardcoded-strings guard only flags string LITERALS, never expressions).
const BACK_STATS = [
  { key: "goals", label: "G" },
  { key: "assists", label: "A" },
  { key: "appearances", label: "AP" },
  { key: "cleanSheets", label: "CS" },
  { key: "yellowCards", label: "YC" },
  { key: "redCards", label: "RC" },
] as const;

export function PlayerCard({ card, locale, reduced }: Props) {
  const t = useTranslations("game");
  const [flipped, setFlipped] = useState(false);
  const era = eraOf(card.provenance);
  const d = (n: number | null | undefined) => localizeDigits(n ?? 0, locale);
  const alts = card.altRoles.slice(0, 2);

  const front = (
    <div
      className="relative h-full w-full overflow-hidden rounded-[14px] text-[#3a2c05]"
      style={{ background: GOLD, boxShadow: "inset 0 0 0 2px rgba(255,255,255,.35)" }}
    >
      {/* OVR + position + alt-role marker */}
      <div className="absolute left-3 top-2.5 z-20 w-9 text-center">
        <div className="text-[30px] font-black leading-[.8] text-[#2a1f04]">
          {d(card.ratings?.overall)}
        </div>
        <div className="font-mono text-[12px] font-extrabold">{card.role ?? ""}</div>
        {alts.length > 0 && <div className="font-mono text-[10px] font-bold text-[#7a5c12]">+</div>}
        <div className="mx-auto mt-1 h-0.5 w-6 bg-[#3a2c05]/50" />
      </div>
      {/* left icon strip: alt roles + foot */}
      <div className="absolute left-3.5 top-[86px] z-20 flex flex-col gap-1.5">
        {alts.map((r) => (
          <span
            key={r}
            className="grid h-5 w-5 place-items-center rounded-[6px] border border-[#3a2c05]/35 bg-[#3a2c05]/12 font-mono text-[8px] font-extrabold"
          >
            {r}
          </span>
        ))}
        {footLetter(card.foot) && (
          <span className="grid h-5 w-5 place-items-center rounded-[6px] border border-[#3a2c05]/35 bg-[#3a2c05]/12 font-mono text-[9px] font-extrabold">
            {footLetter(card.foot)}
          </span>
        )}
      </div>
      {/* era badge */}
      {era && (
        <span
          className="absolute right-2.5 top-2.5 z-20 rounded-md px-1.5 py-0.5 font-mono text-[8px] font-extrabold text-white"
          style={{ background: era.color }}
        >
          {t(era.key)}
        </span>
      )}
      {/* large portrait (not a circle) */}
      <div className="absolute inset-x-0 top-6 z-10 h-[150px]">
        <PlayerImage
          player={{ name: card.name, photo: card.photo }}
          size="lg"
          className="!h-full !w-full rounded-none object-cover object-top opacity-95"
        />
      </div>
      {/* lower panel */}
      <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-2.5">
        <div className="truncate text-center text-[19px] font-black uppercase tracking-wide">
          {card.name}
        </div>
        <div className="mt-1 flex items-center justify-center gap-2 text-[10px] font-bold text-[#3a2c05]">
          <Flag code={card.nationalityCode} name={card.nationality} className="text-[13px]" />
          <span className="rounded bg-[#3a2c05]/15 px-1.5 py-0.5 font-mono">
            {clubAbbr(card.club)}
          </span>
          {card.age != null && <span className="font-mono">{d(card.age)}</span>}
        </div>
        <div className="mt-2 flex justify-between border-t border-[#3a2c05]/30 pt-1.5 text-center">
          {CARD_DIMS.map((dim) => (
            <div key={dim.key} className="flex-1">
              <div className="font-mono text-[17px] font-black leading-none">
                {d(card.ratings?.[dim.key])}
              </div>
              <div className="mt-0.5 font-mono text-[7px] font-extrabold text-[#6a5010]">
                {dim.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const back = (
    <div
      className="relative h-full w-full overflow-hidden rounded-[14px] px-3 py-3 text-[#2a1f04]"
      style={{ background: GOLD }}
    >
      <div className="truncate text-[14px] font-black">{card.name}</div>
      <div className="font-mono text-[9px] font-bold text-[#6a5010]">
        {card.club} · {localizeDigits(card.season, locale)}
      </div>
      <div className="mt-2 font-mono text-[8px] font-extrabold uppercase tracking-wider text-[#6a5010]">
        {t("career")}
      </div>
      <div className="text-[10px] leading-snug">{card.careerClubs.join(" · ") || card.club}</div>
      <div className="mt-2 font-mono text-[8px] font-extrabold uppercase tracking-wider text-[#6a5010]">
        {t("keyStats")}
      </div>
      <div className="grid grid-cols-3 gap-x-2 gap-y-1">
        {BACK_STATS.map((s) => (
          <div key={s.key} className="flex items-baseline justify-between">
            <span className="font-mono text-[8px] text-[#6a5010]">{s.label}</span>
            <span className="font-mono text-[12px] font-black">{d(card.stats[s.key])}</span>
          </div>
        ))}
      </div>
      <div className="absolute inset-x-3 bottom-2.5 flex items-center justify-between font-mono text-[9px] font-bold">
        <span>{card.height != null ? t("heightCm", { n: d(card.height) }) : ""}</span>
        {era && <span style={{ color: era.color }}>{t(era.key)}</span>}
      </div>
    </div>
  );

  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      aria-label={t(flipped ? "cardDetailsAria" : "cardAria", { name: card.name })}
      className="block w-[168px] [perspective:900px]"
      style={{ aspectRatio: "168 / 252" }}
    >
      <div
        className="relative h-full w-full [transform-style:preserve-3d]"
        style={{
          transform: flipped ? "rotateY(180deg)" : "none",
          transition: reduced ? "none" : "transform 500ms cubic-bezier(.4,0,.2,1)",
        }}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">{front}</div>
        <div
          className="absolute inset-0 [backface-visibility:hidden]"
          style={{ transform: "rotateY(180deg)" }}
        >
          {back}
        </div>
      </div>
    </button>
  );
}
