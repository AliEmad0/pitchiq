import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  buildPool,
  captaincyCounts,
  clubChoices,
  refereeNames,
} from "@/features/game/adapter/pool";
import { GamePlay } from "@/features/game/components/GamePlay";
import { packFor, routedPacks } from "@/features/game/domain/rule-packs";

export const dynamic = "force-static";
export const revalidate = 86400;

/**
 * ⛔ NO on-demand rendering, ever — and this route is where it matters most.
 *
 * `force-static` does not stop a dynamic segment rendering unknown params at request time.
 * `/game/legacy/999999` would otherwise build a pool, run a lambda and cache a page, so a
 * crawler walking invented ids could burn Fluid Active CPU indefinitely. The club list is
 * closed, so anything outside it 404s before the page runs.
 */
export const dynamicParams = false;

type Props = { params: Promise<{ locale: string; mode: string; club: string }> };

/**
 * One prerendered page per (pack, club).
 *
 * ⚠️ THE CLUB IS IN THE URL BECAUSE OF THE PAYLOAD (owner change, 2026-08-17). A club's
 * complete history is ~900 enriched cards (~720 KB); all 51 on a single page would be
 * ~6.7 MB. Splitting by club keeps every page force-static and CDN-served while letting
 * the card set be complete — every player, every season he played for that club.
 */
export async function generateStaticParams(): Promise<Array<{ mode: string; club: string }>> {
  const clubs = await clubChoices();
  return routedPacks().flatMap((p) => clubs.map((c) => ({ mode: p.id, club: String(c.id) })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, mode, club } = await params;
  setRequestLocale(locale);
  if (packFor(mode) == null) return {};
  const name = (await clubChoices()).find((c) => String(c.id) === club)?.name;
  if (name == null) return {};
  const t = await getTranslations("game");
  // The club's own name is the title — it is the subject of the page, and it comes from
  // the data rather than the catalog.
  return { title: `${name} — ${t("legacyTitle")}`, description: t("legacyPick") };
}

export default async function ModeClubPage({ params }: Props) {
  const { locale, mode, club } = await params;
  setRequestLocale(locale);

  // ⛔ Three ways to 404, all of them bad input from a URL a stranger controls: an unknown
  // mode, a mode that has no chooser (so this depth is meaningless for it), and a club id
  // that never played in the Premier League.
  const pack = packFor(mode);
  if (pack == null || pack.chooser == null) notFound();
  const choice = (await clubChoices()).find((c) => String(c.id) === club);
  if (choice == null) notFound();

  const pool = await buildPool(pack.pool, choice.id);
  // Build time, and narrowed to this club's players — the armband rule needs real
  // captaincies, and the full season → team → player map would be a second payload.
  const captaincies = await captaincyCounts(pool.map((c) => c.playerId));
  const referees = await refereeNames();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <GamePlay
        pool={pool}
        initialPhase="setup"
        draft={pack.draft}
        screens={pack.screens}
        captaincies={captaincies}
        referees={referees}
        backHref={`/game/${pack.id}`}
      />
    </main>
  );
}
