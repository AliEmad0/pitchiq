import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  buildPool,
  captaincyCounts,
  clubChoices,
  iconChoices,
  nationChoices,
  refereeNames,
} from "@/features/game/adapter/pool";
import { countryNameFromCode } from "@/utils/country";
import { GamePlay } from "@/features/game/components/GamePlay";
import { packFor, routedPacks } from "@/features/game/domain/rule-packs";

export const dynamic = "force-static";
export const revalidate = false; // see docs/adr or CLAUDE.md — deploys are the only data change

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
/**
 * One prerendered page per (pack, choice).
 *
 * ⛔ CHOOSER-AWARE, and this is where it must be. The first version mapped every routed
 * pack over CLUBS, so registering Captain's Draft generated `/game/captains/<clubId>` for
 * all 51 clubs — each handing a club id to `captainSynergy` as a captain id, returning an
 * empty pool, filtering away every formation and killing the prerender on `shape.slots`.
 * It failed the Vercel build. A pack's `chooser.kind` decides what this segment MEANS.
 */
export async function generateStaticParams(): Promise<Array<{ mode: string; club: string }>> {
  const [clubs, icons, nations] = await Promise.all([
    clubChoices(),
    iconChoices(),
    nationChoices(),
  ]);
  // ⛔ Per chooser KIND, and a new kind must be handled HERE before its pack enters
  // RULE_PACKS — mapping a nation pack over clubs is exactly how Captain's Draft once broke
  // the Vercel build (a club id handed to the pool builder as something it is not).
  return routedPacks().flatMap((p) =>
    p.chooser?.kind === "nation"
      ? nations.map((n) => ({ mode: p.id, club: n.code }))
      : (p.chooser?.kind === "captain" ? icons : clubs).map((c) => ({
          mode: p.id,
          club: String(c.id),
        })),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, mode, club } = await params;
  setRequestLocale(locale);
  const pack = packFor(mode);
  if (pack == null) return {};
  const kind = pack.chooser?.kind;
  const name =
    kind === "nation"
      ? (await nationChoices()).some((n) => n.code === club)
        ? countryNameFromCode(club, locale)
        : null
      : kind === "captain"
        ? (await iconChoices()).find((i) => String(i.id) === club)?.name
        : (await clubChoices()).find((c) => String(c.id) === club)?.name;
  if (name == null) return {};
  const t = await getTranslations("game");
  // The club's — the icon's, the nation's — own name is the title. It is the subject of the
  // page, and it comes from the data rather than the catalog.
  return {
    title: `${name} — ${t(kind === "captain" ? "captainsTitle" : kind === "nation" ? "nationTitle" : "legacyTitle")}`,
    description: t(
      kind === "captain" ? "captainsPick" : kind === "nation" ? "nationPick" : "legacyPick",
    ),
  };
}

export default async function ModeClubPage({ params }: Props) {
  const { locale, mode, club } = await params;
  setRequestLocale(locale);

  // ⛔ Three ways to 404, all of them bad input from a URL a stranger controls: an unknown
  // mode, a mode that has no chooser (so this depth is meaningless for it), and a club id
  // that never played in the Premier League.
  const pack = packFor(mode);
  if (pack == null || pack.chooser == null) notFound();
  const isCaptain = pack.chooser.kind === "captain";
  const isNation = pack.chooser.kind === "nation";
  // A nation's "id" is its flag-icons CODE — a string, which is why `buildPool`'s `only`
  // widened. Everything else here keys on numbers exactly as before.
  const nation = isNation ? (await nationChoices()).find((n) => n.code === club)?.code : undefined;
  const choice = isNation
    ? undefined
    : isCaptain
      ? (await iconChoices()).find((i) => String(i.id) === club)
      : (await clubChoices()).find((c) => String(c.id) === club);
  if (isNation ? nation == null : choice == null) notFound();

  const pool = await buildPool(pack.pool, isNation ? nation : choice!.id);
  /**
   * The icon, pulled back out of the pool he is part of.
   *
   * ⛔ He IS in the pool — every path that rebuilds this match resolves the saved XI
   * against it — and he is handed to the draft separately so it can PLACE him without
   * ever dealing him. See `roomDeals`'s `excludePlayers`.
   */
  const captain =
    isCaptain && choice != null ? pool.find((c) => c.playerId === choice.id) : undefined;
  // Build time, and narrowed to this club's players — the armband rule needs real
  // captaincies, and the full season → team → player map would be a second payload.
  const captaincies = await captaincyCounts(pool.map((c) => c.playerId));
  const referees = await refereeNames();
  // ⚠️ Names only. The chosen club's SQUAD is fetched from its own prerendered route — see
  // `view/rival-choice.ts`; 51 squads on this page would be ~1.2 MB on top of ~700 KB.
  // ⭐ A NATION drafts against NATIONS (owner, 2026-08-27) — facing Arsenal with an Egypt
  // side was the club menu leaking through the shared route. Same wire shape, ids are
  // flag-icons codes, and the localized name comes from the code.
  const rivals = isNation
    ? (await nationChoices()).map((n) => ({
        id: n.code,
        name: countryNameFromCode(n.code, locale) ?? n.code,
      }))
    : (await clubChoices()).map((c) => ({ id: c.id, name: c.name }));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <GamePlay
        pool={pool}
        initialPhase="setup"
        draft={pack.draft}
        screens={pack.screens}
        opponent={pack.opponent}
        rivals={rivals}
        // ⚠️ Only a club choice is a CLUB. An icon's id is a player's, and passing it here
        // would ask `ClubCrest` for a crest that does not exist.
        clubId={isCaptain || isNation ? undefined : choice!.id}
        captain={captain}
        nation={nation}
        captaincies={captaincies}
        referees={referees}
        backHref={`/game/${pack.id}`}
      />
    </main>
  );
}
