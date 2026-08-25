import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPool, clubChoices, iconChoices } from "@/features/game/adapter/pool";
import { GamePlay } from "@/features/game/components/GamePlay";
import { ModeChooser } from "@/features/game/components/ModeChooser";
import { packFor, routedPacks } from "@/features/game/domain/rule-packs";

// force-static like every other /game route. The whole TASK-M71 arc exists to keep routes
// CDN-served, and a route with only `revalidate` falls back to a dynamic render.
export const dynamic = "force-static";
export const revalidate = false; // see docs/adr or CLAUDE.md — deploys are the only data change

/**
 * ⛔ NO on-demand rendering, ever.
 *
 * `force-static` alone is not enough on a DYNAMIC segment: params outside
 * `generateStaticParams` would still be rendered at request time and cached, which is the
 * exact shape of the 2026-07 Fluid Active-CPU outage — every unknown URL a crawler invents
 * would run a function. The pack list is a closed set, so anything outside it is bad input
 * and 404s without the page ever running.
 */
export const dynamicParams = false;

type Props = { params: Promise<{ locale: string; mode: string }> };

/**
 * One page file, one prerendered page per live rule pack.
 *
 * ⚠️ This is what makes unlocking a mode a DATA change: add a pack and its page appears
 * here. `/game/draft`, `/game/chaos` and `/game/daily` are unaffected — Next resolves
 * static segments before dynamic ones.
 */
export async function generateStaticParams(): Promise<Array<{ mode: string }>> {
  return routedPacks().map((p) => ({ mode: p.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, mode } = await params;
  setRequestLocale(locale);
  const pack = packFor(mode);
  if (pack == null) return {};
  const t = await getTranslations("game");
  // ⚠️ Per PACK, not hardcoded. This route serves every routed pack, and it titled all of
  // them "Legacy Club" until a second one arrived.
  const captain = pack.chooser?.kind === "captain";
  return {
    title: t(captain ? "captainsTitle" : "legacyTitle"),
    description: t(captain ? "captainsPick" : "legacyPick"),
  };
}

export default async function ModePage({ params }: Props) {
  const { locale, mode } = await params;
  setRequestLocale(locale);

  // ⛔ An unknown segment 404s. There must be NO loading.tsx above this route: TASK-M72
  // proved any such file commits a 200 before the page runs, which is exactly the soft-404
  // class that ticket existed to remove.
  const pack = packFor(mode);
  if (pack == null) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      {/* A pack that needs a choice shows the MENU here and carries no cards at all; the
          pool lives one segment deeper, scoped to the choice. A pack without a chooser
          drafts straight from its own pool. */}
      {pack.chooser != null ? (
        <ModeChooser
          mode={pack.id}
          kind={pack.chooser.kind}
          choices={
            pack.chooser.kind === "captain"
              ? (await iconChoices()).map((i) => ({
                  id: i.id,
                  name: i.name,
                  seasons: i.seasons.length,
                  first: i.seasons[0]!,
                  last: i.seasons[i.seasons.length - 1]!,
                  nationalityCode: i.nationalityCode,
                }))
              : await clubChoices()
          }
        />
      ) : (
        <GamePlay
          pool={await buildPool(pack.pool)}
          initialPhase="setup"
          draft={pack.draft}
          screens={pack.screens}
        />
      )}
    </main>
  );
}
