"use client";

import { useTranslations } from "next-intl";
import type { GameTeam } from "@/features/game/domain/team";
import {
  type CraftedTraits,
  type TraitId,
  TRAITS,
  traitsWith,
} from "@/features/game/domain/traits";

/** Catalog keys (next-intl keys avoid dashes). */
const KEY: Record<TraitId, string> = {
  talisman: "talisman",
  rock: "rock",
  engine: "engine",
  "hot-head": "hotHead",
};

/**
 * TASK-1814 — who carries a personality on each side, before kick-off. Traits are read from the
 * cards' ratings (`traitsOf`), so this panel can never disagree with what the engine plays.
 */
export function TraitsPanel({
  home,
  away,
  crafted,
}: {
  home: GameTeam;
  away: GameTeam;
  /** TASK-1829 — the coach's crafted badges, on his side only. */
  crafted?: { side: "home" | "away"; traits: CraftedTraits };
}) {
  const t = useTranslations("gameTraits");
  const side = (team: GameTeam, which: "home" | "away") => {
    const mine = crafted?.side === which ? crafted.traits : undefined;
    const holders = [...team.players, ...(team.bench ?? [])].flatMap((p) =>
      traitsWith(p, mine).map((trait) => ({ p, trait })),
    );
    holders.sort((a, b) => TRAITS.indexOf(a.trait) - TRAITS.indexOf(b.trait));
    return (
      <div className="tp-side">
        <h4 className="tp-team">{team.name}</h4>
        {holders.length === 0 ? (
          <p className="tp-none">{t("none")}</p>
        ) : (
          <ul>
            {holders.map(({ p, trait }) => (
              <li key={`${p.cardId}:${trait}`} data-testid="tp-trait" data-trait={trait}>
                <span className={`tp-chip tp-${KEY[trait]}`}>{t(`name.${KEY[trait]}`)}</span>{" "}
                {p.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };
  return (
    <section className="tp-panel" aria-label={t("title")} data-testid="traits-panel">
      <h3 className="tp-title">{t("title")}</h3>
      <div className="tp-grid">
        {side(home, "home")}
        {side(away, "away")}
      </div>
      <dl className="tp-legend">
        {TRAITS.map((trait) => (
          <div key={trait}>
            <dt className={`tp-chip tp-${KEY[trait]}`}>{t(`name.${KEY[trait]}`)}</dt>
            <dd>{t(`desc.${KEY[trait]}`)}</dd>
          </div>
        ))}
        <div>
          <dt className="tp-chip tp-swing">{t("swingName")}</dt>
          <dd>{t("swingDesc")}</dd>
        </div>
      </dl>
    </section>
  );
}
