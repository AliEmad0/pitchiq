import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPool, captaincyCounts, refereeNames } from "@/features/game/adapter/pool";
import { GamePlay } from "@/features/game/components/GamePlay";
import { CHEMISTRY_PACK } from "@/features/game/domain/rule-packs";

export const dynamic = "force-static";
export const revalidate = false; // see CLAUDE.md — deploys are the only data change

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");
  return { title: t("chemistryTitle"), description: t("chemistrySubtitle") };
}

/**
 * Does this pack score its XI on chemistry?
 *
 * ⚠️ Read off the pack's own constraints rather than restated, the same way the budget page
 * reads its cap. The rule lives in ONE place, so a pack that stops declaring it stops
 * rendering the links — there is no second literal to fall out of step.
 */
function scoresChemistry(): boolean {
  return CHEMISTRY_PACK.constraints.some((c) => c.kind === "chemistry");
}

/**
 * TASK-1810 PR 5 — the Chemistry Draft.
 *
 * ⚠️ A BESPOKE route, like `/game/budget` and `/game/chaos`, because the pack has no chooser:
 * the pool is one cross-era set and there is nothing to pick before drafting. `routedPacks()`
 * filters on `chooser != null`, so this pack must never reach the parameterised
 * `/game/[mode]` pair — handing a chooser-less pack to a chooser-aware route is what broke
 * the Vercel build once.
 */
export default async function ChemistryDraftPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // ⚠️ Built at BUILD TIME and baked into this page. 600 cards across all 34 seasons — the
  // breadth IS the mechanic here (a dense pool links by itself), and it is a measured cap.
  const pool = await buildPool(CHEMISTRY_PACK.pool);
  const captaincies = await captaincyCounts(pool.map((c) => c.playerId));
  const referees = await refereeNames();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      {/* ⚠️ Every input is a PROP off the pack, never a mode check — "modes are rule packs
          (data), not code paths". `GamePlay` must not learn that a mode called chemistry
          exists. */}
      <GamePlay
        pool={pool}
        initialPhase="setup"
        draft={CHEMISTRY_PACK.draft}
        screens={CHEMISTRY_PACK.screens}
        opponent={CHEMISTRY_PACK.opponent}
        chemistry={scoresChemistry()}
        captaincies={captaincies}
        referees={referees}
      />
    </main>
  );
}
