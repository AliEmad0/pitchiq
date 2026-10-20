"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  type AlbumEntry,
  loadAlbum,
  loadUnlocks,
  type Unlock,
} from "@/features/game/storage/trophy-slot";
import { backfillTrophies } from "@/features/game/view/trophy-backfill";
import { localDay } from "@/features/game/view/trophy-record";
import { StickerAlbum } from "./StickerAlbum";
import { TrophyCabinet } from "./TrophyCabinet";

type Tab = "album" | "hall";

/**
 * TASK-1813/1819 — `/game/trophies`: the Album and the Hall of Fame. Everything lives in this
 * browser's IndexedDB; the first open backfills what older saves already prove. `#hall` opens
 * the cabinet directly (the mode gate's Hall of Fame link).
 */
export function TrophyRoom() {
  const t = useTranslations("gameTrophies");
  const [tab, setTab] = useState<Tab>("album");
  const [data, setData] = useState<{ album: AlbumEntry[]; unlocks: Unlock[] } | null>(null);

  useEffect(() => {
    const sync = () => setTab(window.location.hash === "#hall" ? "hall" : "album");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        await backfillTrophies(localDay());
      } catch {
        // Best-effort: the room still opens on what is already stored.
      }
      const [album, unlocks] = await Promise.all([loadAlbum(), loadUnlocks()]);
      if (live) setData({ album, unlocks });
    })();
    return () => {
      live = false;
    };
  }, []);

  const choose = (next: Tab) => {
    setTab(next);
    try {
      window.history.replaceState(null, "", next === "hall" ? "#hall" : window.location.pathname);
    } catch {
      // A convenience only.
    }
  };

  return (
    <section className="tr-room">
      <header className="tr-head">
        <h1 className="tr-title">🏆 {t("title")}</h1>
        <p className="tr-intro">{t("intro")}</p>
      </header>
      <div role="tablist" className="tr-tabs">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "album"}
          onClick={() => choose("album")}
        >
          {t("tabAlbum")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "hall"}
          onClick={() => choose("hall")}
        >
          {t("tabHall")}
        </button>
      </div>
      <div role="tabpanel">
        {data == null ? (
          <p className="ta-empty-state" aria-busy="true">
            {t("loading")}
          </p>
        ) : tab === "album" ? (
          <StickerAlbum album={data.album} />
        ) : (
          <TrophyCabinet unlocks={data.unlocks} />
        )}
      </div>
    </section>
  );
}
