import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RecordsPage } from "@/features/game/components/RecordsPage";

// force-static, like every /game route (the TASK-M71 rule). Every record lives in the
// visitor's IndexedDB and is read after mount.
export const dynamic = "force-static";
export const revalidate = false; // see CLAUDE.md — deploys are the only data change

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("gameRecords");
  return { title: t("title"), description: t("intro") };
}

export default async function RecordsRoute({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      {/* TASK-1812 — the owner's pick, Records #1 Career Programme. */}
      <RecordsPage />
    </main>
  );
}
