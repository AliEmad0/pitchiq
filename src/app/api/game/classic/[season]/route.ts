import { NextResponse } from "next/server";
import { loadClassicData } from "@/features/game/adapter/classic-data";
import { EARLIEST_SEASON, currentDataSeason } from "@/utils/season";
export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = false;
export async function generateStaticParams() {
  return Array.from({ length: currentDataSeason() - EARLIEST_SEASON + 1 }, (_, i) => ({
    season: String(EARLIEST_SEASON + i),
  }));
}
export async function GET(_request: Request, { params }: { params: Promise<{ season: string }> }) {
  const { season } = await params;
  const year = Number(season);
  if (!/^\d{4}$/.test(season) || year < EARLIEST_SEASON || year > currentDataSeason())
    return NextResponse.json({ error: "Unknown season" }, { status: 404 });
  const data = await loadClassicData(year);
  return data
    ? NextResponse.json(data)
    : NextResponse.json({ error: "Classic data unavailable" }, { status: 404 });
}
