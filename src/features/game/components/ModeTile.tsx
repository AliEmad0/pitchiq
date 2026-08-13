"use client";
import { useTranslations } from "next-intl";
import { isPlayable, type GameMode, type ModeId } from "@/features/game/domain/modes";
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
