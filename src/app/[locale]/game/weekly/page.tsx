import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadChaosPool } from "@/features/game/adapter/chaos-pool";
import { clubChoices } from "@/features/game/adapter/pool";
import { WeeklyLadder } from "@/features/game/components/WeeklyLadder";

// force-static like every /game route (the M71 arc). The prerendered HTML carries NO week —
// the week resolves after mount inside the container, or a CDN copy would assert a stale one.
export const dynamic = "force-static";
export const revalidate = false; // see docs/adr or CLAUDE.md — deploys are the only data change

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");
  return { title: t("modeWeeklyName"), description: t("modeWeeklyDesc") };
}

export default async function WeeklyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  // The daily's pool for the coach's deal; the club list (id + name only, a few KB) for the
  // week's rivals, whose squads are fetched from the prerendered `/api/game/rivals/[club]`.
  const [pool, clubs] = await Promise.all([loadChaosPool(), clubChoices()]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      {/* TASK-1828 — one league tournament per ISO week, the same for everyone. */}
      <WeeklyLadder pool={pool} clubs={clubs.map((c) => ({ id: c.id, name: c.name }))} />
    </main>
  );
}
