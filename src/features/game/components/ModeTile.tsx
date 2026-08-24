"use client";
import { useTranslations } from "next-intl";
import { isDirectEntry, isPlayable, type GameMode, type ModeId } from "@/features/game/domain/modes";
import { Link } from "@/i18n/navigation";
import { FormatChoice } from "./FormatChoice";

interface Props {
  mode: GameMode;
  open: boolean;
  onOpen: (id: ModeId) => void;
}

/**
 * One mode on the gate.
 *
 * ⚠️ A `planned` mode is NOT a disabled button — it is not a control at all. Nine locked
 * modes rendered as disabled buttons would be nine dead stops in the tab order, for
 * nothing: there is nowhere to go. It stays perceivable through a visible
 * "In development" label instead.
 *
 * ⚠️ No height animation on the expansion. `tests/unit/motion-audit.test.ts` allowlists
 * `transform` / `opacity` / `box-shadow`, and a height transition is a layout property —
 * it would fail the audit. The panel simply appears.
 */
export function ModeTile({ mode, open, onOpen }: Props) {
  const t = useTranslations("game");
  const name = t(mode.nameKey);

  if (!isPlayable(mode)) {
    return (
      <div className="border-border rounded-full border border-dashed px-3 py-1 text-xs opacity-45">
        <span aria-hidden>{mode.emoji}</span> {name}
        <span className="ms-1 opacity-70">{t("statusPlanned")}</span>
      </div>
    );
  }

  /**
   * A mode with only one applicable format goes straight in (owner, 2026-08-24).
   *
   * The daily is the case: there is no Full Season for "one challenge a day", so expanding
   * the tile only ever offered a single destination behind an extra click, next to a
   * locked box for a format that is never coming.
   */
  if (isDirectEntry(mode)) {
    return (
      <Link
        href={mode.href!}
        className="border-border hover:border-primary/80 block rounded-lg border p-3"
      >
        <span className="block text-xl" aria-hidden>
          {mode.emoji}
        </span>
        <span className="mt-1 block text-sm font-bold">{name}</span>
        <span className="text-muted-foreground block text-xs">{t(mode.descriptionKey)}</span>
      </Link>
    );
  }

  return (
    <div className={`border-border rounded-lg border p-3 ${open ? "border-primary/80" : ""}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpen(mode.id)}
        className="w-full text-start"
      >
        <span className="block text-xl" aria-hidden>
          {mode.emoji}
        </span>
        <span className="mt-1 block text-sm font-bold">{name}</span>
        <span className="text-muted-foreground block text-xs">{t(mode.descriptionKey)}</span>
      </button>
      {open ? <FormatChoice mode={mode} /> : null}
    </div>
  );
}
