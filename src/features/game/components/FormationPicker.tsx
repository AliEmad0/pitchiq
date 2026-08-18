"use client";
import { useTranslations } from "next-intl";
import { FORMATIONS } from "@/features/game/domain/chaos-draft";
import { formationByName, type Formation } from "@/features/game/domain/formation";

/**
 * Family boundaries into `FORMATIONS`, for grouping the picker only.
 *
 * ⚠️ Presentation, not identity. Nothing may resolve a shape through these — the picker
 * hands back a shape resolved by NAME. If the array is ever reordered, only these three
 * ranges change.
 */
const FAMILIES = [
  { labelKey: "formationBackFour", from: 0, to: 10 },
  { labelKey: "formationBackThree", from: 10, to: 16 },
  { labelKey: "formationHistoric", from: 16, to: 20 },
] as const;

interface Props {
  /** The shape currently chosen. Held by the caller, which owns the draft state. */
  value: Formation;
  onChange: (formation: Formation) => void;
  /**
   * The shapes to offer. Defaults to all twenty; Legacy narrows it to the ones the chosen
   * club can actually field once cards are deduped by player (TASK-1810).
   */
  shapes?: readonly Formation[];
}

/**
 * The twenty shapes, grouped by family.
 *
 * Extracted from `DraftHub` by TASK-1810 so the round-based Legacy draft picks its shape
 * through the same control rather than a second one that could drift from it.
 *
 * ⚠️ The option VALUE is the formation's name, and the change handler resolves it with
 * `formationByName`. An index would type-check and read fine while making the array's
 * order — which is presentation only — load-bearing.
 */
export function FormationPicker({ value, onChange, shapes = FORMATIONS }: Props) {
  const t = useTranslations("game");
  const offered = new Set(shapes.map((f) => f.name));
  return (
    <>
      <label htmlFor="formation" className="sr-only">
        {t("draftFormation")}
      </label>
      <select
        id="formation"
        aria-label={t("draftFormation")}
        value={value.name}
        onChange={(e) => onChange(formationByName(e.target.value))}
        className="border-border bg-background rounded-md border px-3 py-1.5 font-mono text-xs font-bold"
      >
        {FAMILIES.map(({ labelKey, from, to }) => {
          const group = FORMATIONS.slice(from, to).filter((f) => offered.has(f.name));
          // A family whose every shape is unfillable is dropped entirely rather than
          // rendered as a heading over nothing.
          return group.length === 0 ? null : (
            <optgroup key={labelKey} label={t(labelKey)}>
              {group.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </>
  );
}
