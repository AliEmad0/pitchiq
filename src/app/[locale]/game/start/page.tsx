import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadFixture } from "@/data/loaders";
import { Onboarding } from "@/features/game/components/Onboarding";
import { TUTORIAL } from "@/features/game/domain/coach";
import { SCENARIOS } from "@/features/game/domain/what-if";

// force-static like every /game route (the TASK-M71 rule). The tutorial's clubs are read from
// the real fixture at build; the match fetches its season's prerendered JSON on the client.
export const dynamic = "force-static";
export const revalidate = false; // see CLAUDE.md — deploys are the only data change

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("gameOnboarding");
  return { title: t("metaTitle"), description: t("subtitle") };
}

export default async function StartPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const s = SCENARIOS.find((x) => x.id === TUTORIAL.scenarioId);
  const f = s == null ? null : await loadFixture(s.fixtureId, s.season);
  if (s == null || f == null) notFound();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      {/* TASK-1827 — the first run: a name, a crest, a 30-second rescue, and the hook. */}
      <Onboarding
        card={{
          id: s.id,
          home: { id: f.homeTeamId, name: f.homeTeamName },
          away: { id: f.awayTeamId, name: f.awayTeamName },
        }}
      />
    </main>
  );
}
