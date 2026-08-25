"use client";
import { useTranslations } from "next-intl";
import { applicableFormats, type GameMode } from "@/features/game/domain/modes";
import { Link } from "@/i18n/navigation";

const LABEL_KEY = { single: "formatSingle", season: "formatSeason" } as const;

/**
 * The One Match / Full Season step inside an expanded tile.
 *
 * ⭐ TASK-1833: the owner rejected the two-box panel and picked the arcade CURSOR SELECT —
 * a list with a ▶ against what you can actually choose. It suits the surface, and it also
 * states the rule below more honestly than two boxes did: a format you cannot pick has no
 * cursor, so the difference between the two is visible before you read a word.
 *
 * ⚠️ A `planned` format renders as TEXT, never a disabled control. Day one that is every
 * mode's `season` — the 38-week engine is TASK-1810/1811 — so a disabled button here would
 * put a dead tab stop under every playable mode on the gate.
 *
 * ⚠️ An `n/a` format is not rendered at all: it is not coming, so a locked row promising it
 * would be a lie rather than a roadmap.
 */
export function FormatChoice({ mode }: { mode: GameMode }) {
  const t = useTranslations("game");

  return (
    <div className="mg-fmt">
      <p className="mg-fmt-h">{t("formatSelectLength")}</p>
      {applicableFormats(mode).map((format) => {
        const label = t(LABEL_KEY[format]);
        const live = mode.formats[format] === "live" && mode.href != null;

        if (!live) {
          return (
            <p key={format} className="mg-fmt-row">
              {/* No cursor: there is nothing here to move onto. */}
              <span className="mg-fmt-cur" aria-hidden />
              <span className="mg-fmt-l">{label}</span>
              <span className="mg-fmt-x">{t("statusPlanned")}</span>
            </p>
          );
        }

        return (
          <Link key={format} href={mode.href!} className="mg-fmt-row mg-fmt-on">
            <span className="mg-fmt-cur" aria-hidden>
              ▶
            </span>
            {/* ⚠️ No hint here (owner, 2026-08-25). "About three minutes" beside the label
                squeezed "One Match" onto two lines in a tile this narrow, and the duration
                is not the choice being made — the length is already in the label. */}
            <span className="mg-fmt-l">{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
