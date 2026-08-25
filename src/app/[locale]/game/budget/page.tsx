import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPool, captaincyCounts, refereeNames } from "@/features/game/adapter/pool";
import { GamePlay } from "@/features/game/components/GamePlay";
import { BUDGET_PACK } from "@/features/game/domain/rule-packs";

export const dynamic = "force-static";
export const revalidate = false; // see CLAUDE.md — deploys are the only data change

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");
  return { title: t("budgetTitle"), description: t("budgetSubtitle") };
}

/**
 * The pack's cap, read off its own constraint rather than restated here.
 *
 * ⚠️ A second literal would be a second source of truth: the number the meter shows and the
 * number the coach may spend have to be the same one, or the screen lies about the rule.
 */
function budgetOf(): number {
  const cap = BUDGET_PACK.constraints.find((c) => c.kind === "budgetCap");
  return cap?.kind === "budgetCap" ? cap.amountEur : 0;
}

export default async function BudgetDraftPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // ⚠️ Built at BUILD TIME and baked into this page — the whole 600-card pool is the payload,
  // which is why its cap is a measured number and not a preference.
  const pool = await buildPool(BUDGET_PACK.pool);
  const captaincies = await captaincyCounts(pool.map((c) => c.playerId));
  const referees = await refereeNames();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      {/* ⚠️ Every input is a PROP off the pack, never a mode check — "modes are rule packs
          (data), not code paths". `GamePlay` must not learn that a mode called budget exists. */}
      <GamePlay
        pool={pool}
        initialPhase="setup"
        draft={BUDGET_PACK.draft}
        screens={BUDGET_PACK.screens}
        opponent={BUDGET_PACK.opponent}
        budget={budgetOf()}
        captaincies={captaincies}
        referees={referees}
      />
    </main>
  );
}
