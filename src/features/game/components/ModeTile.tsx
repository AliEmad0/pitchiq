"use client";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { isDirectEntry, isPlayable, type GameMode, type ModeId } from "@/features/game/domain/modes";
import { Link } from "@/i18n/navigation";
import { FormatChoice } from "./FormatChoice";
import { ModeMark } from "./ModeMark";

interface Props {
  mode: GameMode;
  open: boolean;
  onOpen: (id: ModeId) => void;
}

/**
 * One slot in the cabinet (TASK-1833).
 *
 * ⭐ Every mode carries its OWN colour, and the colour does the hierarchy: a playable mode
 * is a lit sign, an unbuilt one is the same sign switched off. That was the owner's answer
 * to the ticket's "mostly grey" problem — seven of eleven modes are locked, and dimming
 * them further only made the page look unfinished.
 *
 * ⚠️ A `planned` mode is NOT a disabled button — it is not a control at all. Seven locked
 * modes rendered as disabled buttons would be seven dead stops in the tab order, for
 * nothing: there is nowhere to go. It stays perceivable through a visible label instead.
 *
 * ⚠️ No height animation on the expansion. `tests/unit/motion-audit.test.ts` allowlists
 * `transform` / `opacity` / `box-shadow`, and a height transition is a layout property.
 * The panel's SPACE appears at once; only its CONTENT animates — which is why the owner
 * saw the reflow in the gallery before choosing.
 */
export function ModeTile({ mode, open, onOpen }: Props) {
  const t = useTranslations("game");
  const name = t(mode.nameKey);
  /** The mode's accent, handed to CSS as a custom property. See `GameMode.accent`. */
  const themed = { "--mg-a": mode.accent } as CSSProperties;

  if (!isPlayable(mode)) {
    return (
      <div className="mg-slot mg-slot-off" style={themed}>
        <span className="mg-slot-mk">
          <ModeMark id={mode.id} />
        </span>
        <span className="mg-slot-n">{name}</span>
        <span className="mg-slot-x">{t("statusPlanned")}</span>
      </div>
    );
  }

  const face = (
    <>
      <span className="mg-slot-mk">
        <ModeMark id={mode.id} />
      </span>
      <span className="mg-slot-n">{name}</span>
      <span className="mg-slot-d">{t(mode.descriptionKey)}</span>
    </>
  );

  /**
   * A mode with only one applicable format goes straight in (owner, 2026-08-24 —
   * TASK-1841). The daily is the case: there is no Full Season for "one challenge a day".
   */
  if (isDirectEntry(mode)) {
    return (
      <Link href={mode.href!} className="mg-slot mg-slot-on mg-slot-link" style={themed}>
        {face}
      </Link>
    );
  }

  return (
    <div className={`mg-slot mg-slot-on ${open ? "mg-slot-open" : ""}`} style={themed}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpen(mode.id)}
        className="mg-slot-btn"
      >
        {face}
      </button>
      {open ? <FormatChoice mode={mode} /> : null}
    </div>
  );
}
