"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { type Badge, CRAFT_COST, craftable, duplicates } from "@/features/game/domain/crafting";
import type { TraitId } from "@/features/game/domain/traits";
import { craftBadge } from "@/features/game/storage/badge-slot";
import type { AlbumEntry } from "@/features/game/storage/trophy-slot";
import { localizeDigits } from "@/utils/format";

const KEY: Record<TraitId, string> = {
  talisman: "talisman",
  rock: "rock",
  engine: "engine",
  "hot-head": "hotHead",
};

/**
 * TASK-1829 — the workshop under the album: every sticker with enough duplicates can mint ONE
 * trait badge. ⚠️ Says where a badge plays — season runs, the weekly ladder and the Mystery
 * Market — because a badge that silently did nothing in a single match would read as broken.
 */
export function CraftWorkshop({
  album,
  badges,
  onCrafted,
}: {
  album: readonly AlbumEntry[];
  badges: readonly Badge[];
  onCrafted: () => void;
}) {
  const t = useTranslations("gameCraft");
  const tt = useTranslations("gameTraits");
  const locale = useLocale();
  const d = (v: number) => localizeDigits(v, locale);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const badgeOf = new Map(badges.map((b) => [b.cardId, b]));

  // One row per CARD: a card fielded for two clubs is two stickers, and either can pay.
  const ready = album
    .filter((e) => !badgeOf.has(e.cardId) && duplicates(e.count) >= CRAFT_COST)
    .sort((a, b) => b.ovr - a.ovr)
    .filter((e, i, all) => all.findIndex((x) => x.cardId === e.cardId) === i);
  const crafted = album.filter(
    (e, i, all) => badgeOf.has(e.cardId) && all.findIndex((x) => x.cardId === e.cardId) === i,
  );

  return (
    <section className="cw-root" data-testid="craft-workshop" aria-label={t("title")}>
      <h3 className="cw-title">{t("title")}</h3>
      <p className="cw-sub">{t("rule", { cost: d(CRAFT_COST) })}</p>
      {failed ? <p role="alert">{t("failed")}</p> : null}
      {ready.length === 0 ? (
        <p className="cw-none">{t("none", { cost: d(CRAFT_COST) })}</p>
      ) : (
        <ul className="cw-list">
          {ready.map((e) => (
            <li key={e.cardId} className="cw-row" data-testid="cw-ready">
              <span className="cw-name">
                {e.name} <span className="cw-dup">{t("dups", { n: d(duplicates(e.count)) })}</span>
              </span>
              <span className="cw-traits">
                {craftable({ role: e.role as never }).map((trait) => (
                  <button
                    key={trait}
                    type="button"
                    className={`tp-chip tp-${KEY[trait]} cw-pick`}
                    disabled={busy != null}
                    onClick={() => {
                      setBusy(e.cardId);
                      setFailed(false);
                      void craftBadge(e, trait, new Date().toISOString()).then((ok) => {
                        setBusy(null);
                        if (ok) onCrafted();
                        else setFailed(true);
                      });
                    }}
                  >
                    {tt(`name.${KEY[trait]}`)}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {crafted.length > 0 ? (
        <>
          <p className="cw-label">{t("crafted")}</p>
          <ul className="cw-list">
            {crafted.map((e) => {
              const b = badgeOf.get(e.cardId)!;
              return (
                <li key={e.cardId} className="cw-row" data-testid="cw-crafted">
                  <span className="cw-name">{e.name}</span>
                  <span className={`tp-chip tp-${KEY[b.trait]}`}>{tt(`name.${KEY[b.trait]}`)}</span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
