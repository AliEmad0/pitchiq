import { useTranslations } from "next-intl";

import type { PlayerRole } from "@/data/schemas";
import { ROLE_PITCH_POS } from "@/features/players/role-pitch";

import styles from "./PlayerRoleBlock.module.css";

type Foot = "left" | "right" | "both";

const FOOT_KEY = {
  left: "footLeft",
  right: "footRight",
  both: "footBoth",
} as const;

/**
 * TASK-M70: the enriched positional block on `/players/[id]` — a mini-pitch role
 * map (the role glows, alt-roles are hollow), the role monogram (quietly morphing
 * with the coarse position), and foot/height vitals as pills. Rendered only when
 * `role` is enriched; the hero falls back to the plain position line otherwise.
 *
 * A pure Server Component: every animation lives in the CSS module (transform /
 * opacity only, `prefers-reduced-motion`-gated), so no client JS is needed.
 */
export function PlayerRoleBlock({
  role,
  altRoles,
  coarsePosition,
  foot,
  height,
}: {
  role: PlayerRole;
  altRoles: PlayerRole[];
  /** Already-localized coarse position (e.g. "Defender") — the morph counterpart. */
  coarsePosition: string;
  foot: Foot | null;
  height: number | null;
}) {
  const t = useTranslations("players");
  const rolePos = ROLE_PITCH_POS[role];
  const alts = altRoles.filter((r) => r !== role);
  const footLabel = foot ? t(FOOT_KEY[foot]) : null;

  return (
    <div className={styles.block}>
      {/* Mini-pitch role map. Not mirrored in RTL — a right-back sits on the
          right regardless of reading direction — so it's pinned dir="ltr". */}
      <div className={styles.pitch} role="img" aria-label={t(`roleName.${role}`)} dir="ltr">
        <span className={styles.grass} aria-hidden />
        <span className={styles.line} aria-hidden />
        <span className={styles.circle} aria-hidden />
        {alts.map((r) => {
          const p = ROLE_PITCH_POS[r];
          return (
            <span
              key={r}
              className={`${styles.node} ${styles.alt}`}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              aria-hidden
            />
          );
        })}
        <span
          className={`${styles.node} ${styles.role}`}
          style={{ left: `${rolePos.x}%`, top: `${rolePos.y}%` }}
          aria-hidden
        />
        <span className={styles.sweep} aria-hidden />
      </div>

      <div className={styles.info}>
        {/* The role code, quietly morphing with the coarse position on a loop. */}
        <div className={styles.mono} aria-hidden>
          <span className={styles.mRole}>{role}</span>
          <span className={styles.mCoarse}>{coarsePosition}</span>
        </div>
        <span className="sr-only">{t(`roleName.${role}`)}</span>

        {alts.length > 0 && (
          <p className={styles.also}>
            {t("canAlsoPlay")} <span className={styles.altCodes}>{alts.join(" · ")}</span>
          </p>
        )}

        {(footLabel || height != null) && (
          <div className={styles.pills}>
            {footLabel && (
              <span className={styles.pill} title={t("preferredFoot")}>
                <span className="sr-only">{t("preferredFoot")}: </span>
                {footLabel}
              </span>
            )}
            {height != null && (
              <span className={styles.pill} title={t("heightLabel")}>
                {t("heightCm", { cm: height })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
