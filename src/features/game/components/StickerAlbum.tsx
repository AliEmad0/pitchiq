"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import type { AlbumSeason } from "@/features/game/domain/album";
import type { AlbumEntry } from "@/features/game/storage/trophy-slot";
import { fetchSeason } from "@/features/game/view/trophy-record";
import { localizeDigits } from "@/utils/format";
import { ClubCrest } from "./ClubCrest";

/** Every club-season in the archive — the album's denominator (measured: 686). */
export const ALL_SETS = 686;

const yr = (s: number) => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;
const surname = (n: string) => n.split(" ").slice(-1)[0] ?? n;
const pairKey = (season: number, teamId: number) => `${season}:${teamId}`;

/**
 * TASK-1819 — the owner's Album #1 "Panini Classic": a two-page sticker spread per club-season.
 * Collected cards are stickers (OVR, surname, role); missing ones are numbered empty slots whose
 * names stay hidden — it is an album. A finished set turns gold.
 *
 * The set lists come from the prerendered `/api/game/album/<season>` files, fetched only for the
 * seasons the coach has cards in.
 */
export function StickerAlbum({ album }: { album: readonly AlbumEntry[] }) {
  const t = useTranslations("gameTrophies");
  const locale = useLocale();
  const d = (v: string | number) => localizeDigits(v, locale);

  const have = useMemo(() => new Set(album.map((e) => `${e.cardId}#${e.teamId}`)), [album]);
  /** The club-seasons he has at least one card in, most cards first within a season. */
  const touched = useMemo(() => {
    const n = new Map<string, { season: number; teamId: number; count: number }>();
    for (const e of album) {
      if (e.teamId <= 0) continue;
      const k = pairKey(e.season, e.teamId);
      const hit = n.get(k);
      if (hit) hit.count++;
      else n.set(k, { season: e.season, teamId: e.teamId, count: 1 });
    }
    return [...n.values()].sort((a, b) => b.season - a.season || b.count - a.count);
  }, [album]);
  const seasons = useMemo(() => [...new Set(touched.map((p) => p.season))], [touched]);

  const [sets, setSets] = useState<Record<number, AlbumSeason | null>>({});
  useEffect(() => {
    let live = true;
    void Promise.all(seasons.map(async (s) => [s, await fetchSeason(s)] as const)).then((rows) => {
      if (live) setSets(Object.fromEntries(rows));
    });
    return () => {
      live = false;
    };
  }, [seasons]);

  const [pick, setPick] = useState<{ season: number; teamId: number } | null>(null);
  const current = pick ?? touched[0] ?? null;

  const clubOf = (season: number, teamId: number) =>
    sets[season]?.clubs.find((c) => c.teamId === teamId) ?? null;
  const isDone = (season: number, teamId: number) => {
    const club = clubOf(season, teamId);
    return (
      club != null &&
      club.cards.length > 0 &&
      club.cards.every((c) => have.has(`${c.id}#${teamId}`))
    );
  };
  const setsDone = touched.filter((p) => isDone(p.season, p.teamId)).length;

  if (album.length === 0) return <p className="ta-empty-state">{t("empty")}</p>;

  const club = current == null ? null : clubOf(current.season, current.teamId);
  const owned = club?.cards.filter((c) => have.has(`${c.id}#${current!.teamId}`)).length ?? 0;
  const gold = current != null && isDone(current.season, current.teamId);
  const half = Math.ceil((club?.cards.length ?? 0) / 2);

  return (
    <div className="ta-root">
      <p className="ta-total">
        {t("albumTotal", { cards: d(album.length), sets: d(setsDone), total: d(ALL_SETS) })}
      </p>

      <p className="ta-label">{t("seasons")}</p>
      <div className="ta-chips">
        {seasons.map((s) => (
          <button
            key={s}
            type="button"
            className="ta-chip"
            aria-pressed={current?.season === s}
            onClick={() => setPick(touched.find((p) => p.season === s) ?? null)}
          >
            {d(yr(s))}
          </button>
        ))}
      </div>

      <p className="ta-label">{t("clubs")}</p>
      <div className="ta-chips">
        {touched
          .filter((p) => p.season === current?.season)
          .map((p) => (
            <button
              key={pairKey(p.season, p.teamId)}
              type="button"
              className="ta-chip"
              aria-pressed={current?.teamId === p.teamId}
              onClick={() => setPick(p)}
            >
              <ClubCrest teamId={p.teamId} size={16} />
              {clubOf(p.season, p.teamId)?.name ?? ""}
              {isDone(p.season, p.teamId) ? " ★" : ""}
            </button>
          ))}
      </div>

      {current == null ? null : club == null ? (
        <p className="ta-empty-state">{current.season in sets ? t("noSet") : t("loading")}</p>
      ) : (
        <>
          <div className="ta-head">
            <ClubCrest teamId={current.teamId} size={40} />
            <div>
              <h3 className="ta-club">
                {club.name} {d(yr(current.season))}
              </h3>
              <p className="ta-progress" data-testid="ta-progress">
                {t("stickers", { have: d(owned), total: d(club.cards.length) })}
                {gold ? ` · ★ ${t("complete")}` : ""}
              </p>
            </div>
          </div>
          <div className={`ta-spread${gold ? " is-gold" : ""}`} data-testid="ta-spread" dir="ltr">
            {[club.cards.slice(0, half), club.cards.slice(half)].map((page, p) => (
              <div key={p} className="ta-page">
                {page.map((c, i) => {
                  const n = p * half + i + 1;
                  return have.has(`${c.id}#${current.teamId}`) ? (
                    <div
                      key={c.id}
                      className="ta-sticker"
                      data-testid="ta-sticker"
                      style={{ ["--i" as string]: n } as React.CSSProperties}
                    >
                      <span className="ta-ovr">{d(c.o)}</span>
                      <span className="ta-name">{surname(c.n)}</span>
                      <span className="ta-role">{c.r}</span>
                    </div>
                  ) : (
                    <div key={c.id} className="ta-slot" data-testid="ta-empty">
                      {d(n)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
