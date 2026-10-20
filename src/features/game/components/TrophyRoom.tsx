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
      const read = async () => {
        const [album, unlocks] = await Promise.all([loadAlbum(), loadUnlocks()]);
        if (live) setData({ album, unlocks });
      };
      // What is already stored shows at once; the backfill (which may fetch set lists) then
      // fills in older saves and the room re-reads.
      await read();
      try {
        await backfillTrophies(localDay());
      } catch {
        // Best-effort: the room stays on what is already stored.
      }
      await read();
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
      <div
        role="tablist"
        className="tr-tabs"
        onKeyDown={(e) => {
          // Arrow keys move between the two tabs (WAI-ARIA tabs pattern).
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          const next: Tab = tab === "album" ? "hall" : "album";
          choose(next);
          document.getElementById(`tr-tab-${next}`)?.focus();
        }}
      >
        {(["album", "hall"] as const).map((k) => (
          <button
            key={k}
            id={`tr-tab-${k}`}
            type="button"
            role="tab"
            aria-selected={tab === k}
            aria-controls={`tr-panel-${k}`}
            tabIndex={tab === k ? 0 : -1}
            onClick={() => choose(k)}
          >
            {t(k === "album" ? "tabAlbum" : "tabHall")}
          </button>
        ))}
      </div>
      {data == null ? (
        <p className="ta-empty-state" aria-busy="true">
          {t("loading")}
        </p>
      ) : (
        // ⚠️ Both panels stay MOUNTED and the inactive one is hidden: unmounting the album on a
        // tab switch threw away its loaded set lists, and coming back refetched every season.
        <>
          <div
            role="tabpanel"
            id="tr-panel-album"
            aria-labelledby="tr-tab-album"
            hidden={tab !== "album"}
          >
            <StickerAlbum album={data.album} />
          </div>
          <div
            role="tabpanel"
            id="tr-panel-hall"
            aria-labelledby="tr-tab-hall"
            hidden={tab !== "hall"}
          >
            <TrophyCabinet unlocks={data.unlocks} />
          </div>
        </>
      )}
    </section>
  );
}
