"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  type AlbumEntry,
  loadAlbum,
  loadUnlocks,
  type Unlock,
} from "@/features/game/storage/trophy-slot";
import type { Badge } from "@/features/game/domain/crafting";
import { loadBadges } from "@/features/game/storage/badge-slot";
import { backfillTrophies } from "@/features/game/view/trophy-backfill";
import { localDay } from "@/features/game/view/trophy-record";
import { CraftWorkshop } from "./CraftWorkshop";
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
  const [data, setData] = useState<{
    album: AlbumEntry[];
    unlocks: Unlock[];
    badges: Badge[];
  } | null>(null);
  /** Bumped after a craft so the room re-reads the album and the badges. */
  const [refresh, setRefresh] = useState(0);

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
        const [album, unlocks, badges] = await Promise.all([
          loadAlbum(),
          loadUnlocks(),
          loadBadges(),
        ]);
        if (live) setData({ album, unlocks, badges });
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

  // TASK-1829 — after a craft, re-read the album (counts fell) and the badges (one was minted).
  useEffect(() => {
    if (refresh === 0) return;
    let live = true;
    void Promise.all([loadAlbum(), loadBadges()]).then(([album, badges]) => {
      if (live) setData((prev) => (prev == null ? prev : { ...prev, album, badges }));
    });
    return () => {
      live = false;
    };
  }, [refresh]);

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
            <CraftWorkshop
              album={data.album}
              badges={data.badges}
              onCrafted={() => setRefresh((n) => n + 1)}
            />
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
