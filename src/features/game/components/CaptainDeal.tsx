"use client";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { pickBack } from "@/features/game/domain/card-design";
import { mulberry32 } from "@/features/game/domain/rng";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { randomSeed } from "@/features/game/view/seed";
import { Link } from "@/i18n/navigation";
import { prefersReducedMotion } from "@/utils/motion";
import { CardBack, PlayerCard } from "./PlayerCard";

/** Icons offered per visit. The same hand size the draft rooms deal. */
const HAND = 5;

/**
 * The Captain's Draft chooser: FIVE icons, dealt face-down and turned over.
 *
 * ⭐ Owner, 2026-08-25: the sheet used to lay out all 46 at once, which made the choice an
 * inventory rather than a draft. Five dealt cards makes it luck — the same bargain every
 * other deal in the game strikes.
 *
 * ⛔ The entropy arrives AFTER hydration, never during render. This route is `force-static`,
 * so a seeded deal on the server would bake one hand into the CDN copy and every visitor
 * would meet the same five icons forever. It is the identical rule `/game/chaos` follows,
 * and the reason the first paint is the backs rather than a hand.
 *
 * ⚠️ All 46 cards ship (~23 KB) so any hand can be dealt client-side. That is affordable
 * only because it is ONE card per icon; a synergy pool is ~1.28 MB.
 */
export function CaptainDeal({ cards }: { cards: EnrichedCard[] }) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();
  const [seed, setSeed] = useState<number | null>(null);

  // Post-hydration only — see the class comment.
  useEffect(() => setSeed(randomSeed()), []);

  const hand = useMemo(() => {
    if (seed == null) return [];
    // A seeded shuffle, so the hand replays from its seed like every other deal.
    const rng = mulberry32(seed);
    const pool = [...cards];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, Math.min(HAND, pool.length));
  }, [cards, seed]);

  return (
    <div className="cd-wrap">
      <p className="cd-hint">{seed == null ? t("captainsDealing") : t("captainsPickOne")}</p>
      <div className="cd-hand">
        {/* Before hydration: the backs. Five of them, so the layout does not jump when the
            hand arrives — an earlier surface swapped a placeholder XI in visibly. */}
        {seed == null
          ? Array.from({ length: HAND }, (_, i) => (
              <span key={i} className="cd-card">
                <span className="cd-scale">
                  <span className="cd-face cd-back-only">
                    <CardBack card={cards[i] ?? cards[0]!} back={pickBack(cards[i] ?? cards[0]!)} />
                  </span>
                </span>
              </span>
            ))
          : hand.map((card, i) => (
              <Link key={card.cardId} href={`/game/captains/${card.playerId}`} className="cd-card">
                <span className="cd-scale">
                  <span
                    className="cd-flip"
                    style={reduced ? { animation: "none" } : { animationDelay: `${i * 90}ms` }}
                  >
                    <span className="cd-front">
                      {/* ⛔ interactive={false} — the tile is already a <Link>, and a card
                          that is its own <button> inside one is ejected by the parser. */}
                      <PlayerCard card={card} reduced={reduced} interactive={false} />
                    </span>
                    <span className="cd-backside" aria-hidden>
                      <CardBack card={card} back={pickBack(card)} />
                    </span>
                  </span>
                </span>
              </Link>
            ))}
      </div>
    </div>
  );
}
