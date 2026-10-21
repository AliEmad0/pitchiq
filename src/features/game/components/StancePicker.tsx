"use client";

import { useTranslations } from "next-intl";
import { type Mentality, MENTALITIES } from "@/features/game/domain/mentality";

/**
 * Mentality — the coach's stance, three buttons in the Scout's Dossier's own picker style
 * (`sd-pick`), so it reads as part of the same decision as the style. Also used per matchday on
 * the weekly ladder (TASK-1828).
 */
export function StancePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Mentality;
  onChange: (m: Mentality) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("gameStyle");
  return (
    <>
      <p className="sd-label">{t("stanceLabel")}</p>
      <div className="sd-picks sd-stances" role="group" aria-label={t("stanceLabel")}>
        {MENTALITIES.map((m) => (
          <button
            key={m}
            type="button"
            className="sd-pick"
            data-testid="sd-stance"
            aria-pressed={value === m}
            disabled={disabled}
            onClick={() => onChange(m)}
          >
            {t(`stance.${m}`)}
            <small>{t(`stanceBlurb.${m}`)}</small>
          </button>
        ))}
      </div>
    </>
  );
}
