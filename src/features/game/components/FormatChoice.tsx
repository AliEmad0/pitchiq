"use client";
import { useTranslations } from "next-intl";
import { applicableFormats, type GameMode } from "@/features/game/domain/modes";
import { Link } from "@/i18n/navigation";

const LABEL_KEY = { single: "formatSingle", season: "formatSeason" } as const;
const HINT_KEY = { single: "formatSingleHint", season: "formatSeasonHint" } as const;

/**
 * The One Match / Full Season pair inside an expanded tile.
 *
 * ⚠️ A `planned` format renders as TEXT, never a disabled control. Day one that is every
 * mode's `season` — the 38-week engine is TASK-1810/1811 — so a disabled button here would
 * put a dead tab stop under every playable mode on the gate.
 *
 * ⚠️ An `n/a` format is not rendered at all: it is not coming, so a locked box promising it
 * would be a lie rather than a roadmap.
 */
export function FormatChoice({ mode }: { mode: GameMode }) {
  const t = useTranslations("game");

  return (
    <div className="mt-3 flex gap-2">
      {applicableFormats(mode).map((format) => {
        const label = t(LABEL_KEY[format]);
        const live = mode.formats[format] === "live" && mode.href != null;

        if (!live) {
          return (
            <div
              key={format}
              className="border-border flex-1 rounded-md border border-dashed p-2 text-center opacity-45"
            >
              <span className="block text-xs font-bold">{label}</span>
              <span className="block text-[10px]">{`🔒 ${t("statusPlanned")}`}</span>
            </div>
          );
        }

        return (
          <Link
            key={format}
            href={mode.href!}
            className="border-primary/70 flex-1 rounded-md border p-2 text-center"
          >
            <span className="block text-xs font-bold">{label}</span>
            <span className="text-muted-foreground block text-[10px]">{t(HINT_KEY[format])}</span>
          </Link>
        );
      })}
    </div>
  );
}
