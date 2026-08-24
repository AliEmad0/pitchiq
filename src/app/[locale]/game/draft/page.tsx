import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadChaosPool } from "@/features/game/adapter/chaos-pool";
import { captaincyCounts, refereeNames } from "@/features/game/adapter/pool";
import { GamePlay } from "@/features/game/components/GamePlay";

// force-static, exactly like /game and /game/chaos. The M71 arc exists to keep every
// route CDN-served; a dynamic render here would put game weight back on a lambda.
export const dynamic = "force-static";
export const revalidate = false; // see docs/adr or CLAUDE.md — deploys are the only data change

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");
  return { title: t("draftTitle"), description: t("draftSubtitle") };
}

export default async function DraftPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const pool = await loadChaosPool();
  /**
   * The Legacy screens' two data inputs (TASK-1837).
   *
   * ⚠️ Both are BUILD-TIME reads, narrowed here exactly as the Legacy route narrows them:
   * `captains.json` is server-only and the full season → team → player map would be a
   * second payload, so it ships as the counts for THIS pool's players and nothing more.
   */
  const captaincies = await captaincyCounts(pool.map((c) => c.playerId));
  const referees = await refereeNames();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      {/* TASK-1832 — the canonical Tactical H2H route. `/game/play` used to mount this
          same container with the same props and is now a redirect here. The whole loop
          (draft → pre-match → live → summary) is a state change, never a page load.

          TASK-1837 — `screens="legacy"` moves preview/live/summary onto the matchday
          programme, the split live feed and the Legacy summary (owner, 2026-08-23).
          ⚠️ A PROP, never a mode check: "modes are rule packs, not code paths", and
          `GamePlay` already branches on this field for the Legacy route. */}
      <GamePlay
        pool={pool}
        initialPhase="setup"
        screens="legacy"
        captaincies={captaincies}
        referees={referees}
      />
    </main>
  );
}
