import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadFixture } from "@/data/loaders";
import { type WhatIfCard, WhatIf } from "@/features/game/components/WhatIf";
import { SCENARIOS } from "@/features/game/domain/what-if";

// force-static, like every /game route (the TASK-M71 rule). The scenario list is baked in at
// build; a match fetches its season's PRERENDERED JSON (/api/game/classic/[season]) on the
// client, so nothing here runs per request.
export const dynamic = "force-static";
export const revalidate = false; // see CLAUDE.md — deploys are the only data change

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");
  return { title: t("modeWhatIfName"), description: t("modeWhatIfDesc") };
}

export default async function WhatIfPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  // The clubs' ids and names come from each scenario's real fixture — read at build time.
  const cards: WhatIfCard[] = [];
  for (const s of SCENARIOS) {
    const f = await loadFixture(s.fixtureId, s.season);
    if (f == null) continue;
    cards.push({
      id: s.id,
      home: { id: f.homeTeamId, name: f.homeTeamName },
      away: { id: f.awayTeamId, name: f.awayTeamName },
    });
  }
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      {/* TASK-1816 — step into a real Premier League collapse and rewrite it. */}
      <WhatIf cards={cards} />
    </main>
  );
}
