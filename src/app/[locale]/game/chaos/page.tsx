import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadChaosPool } from "@/features/game/adapter/chaos-pool";
import { captaincyCounts, refereeNames } from "@/features/game/adapter/pool";
import { GamePlay } from "@/features/game/components/GamePlay";

export const dynamic = "force-static";
export const revalidate = false; // see docs/adr or CLAUDE.md — deploys are the only data change

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");
  return { title: t("chaosTitle"), description: t("chaosSubtitle") };
}

export default async function ChaosDraftPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const pool = await loadChaosPool();
  /**
   * The Legacy screens' two data inputs (TASK-1838).
   *
   * ⚠️ Chaos has no club to narrow by, so these are the WHOLE pool's counts — the same
   * call `/game/draft` makes over the same pool, which is the point: both routes draft
   * out of `loadChaosPool()`, so narrowing one and not the other would put a real captain
   * on one live screen and a rating fallback on the other for the identical XI.
   */
  const captaincies = await captaincyCounts(pool.map((c) => c.playerId));
  const referees = await refereeNames();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      {/* TASK-1838 — chaos runs on the interactive driver now. `setup="reveal"` keeps
          Match Night as the setup screen (TASK-1835, untouched); everything after its
          "Play match" is `GamePlay`'s: the matchday programme, the split live feed with
          the Bench, and the Legacy summary. Chaos matches are COACHABLE.
          ⚠️ Both PROPS, never a mode check — "modes are rule packs, not code paths". */}
      <GamePlay
        pool={pool}
        initialPhase="setup"
        setup="reveal"
        screens="legacy"
        captaincies={captaincies}
        referees={referees}
      />
    </main>
  );
}
