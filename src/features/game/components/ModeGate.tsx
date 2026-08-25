"use client";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  COLLECTION_SURFACES,
  GAME_MODES,
  MODE_GROUPS,
  isPlayable,
  modesInGroup,
  type ModeId,
} from "@/features/game/domain/modes";
import { Link } from "@/i18n/navigation";
import { localizeDigits } from "@/utils/format";
import { ModeTile } from "./ModeTile";

/**
 * The gate: every mode the game has or will have, and the way into the ones that work.
 *
 * ⭐ TASK-1833 — "Arcade cabinet", the owner's pick from the 30-concept ritual TASK-1832
 * deferred on purpose. A marquee over a grid of lit slots, with the unlock count where a
 * cabinet prints INSERT COIN.
 *
 * ⭐ The ticket's real problem was that **seven of eleven modes are locked**, and the old
 * gate answered it with opacity — which read as an unfinished game. The answer that
 * shipped is colour: each mode carries its own accent, a playable one is lit, and an
 * unbuilt one is the same sign switched off. Grey stops being the page's dominant note
 * because the page is no longer grey.
 *
 * ⚠️ Modes are NOT split into "play now" and "coming soon" sections any more. They sit in
 * their real groups, in registry order, and status is carried by the tile. Two sections
 * made the locked list a wall of its own — the thing the ticket asked to fix.
 *
 * ⚠️ Renders entirely from `domain/modes.ts`. Nothing here knows what "Season" is — a
 * mode's status drives everything, so unlocking one later stays a data change (TASK-1832
 * D5). Loads NO data and imports no `adapter/*`, which is what keeps `/game` trivially
 * static.
 *
 * One `useState` rather than a reducer: a single piece of state and no illegal transition
 * to guard, unlike `draft-state` / `room-state` / `play-machine`.
 */
export function ModeGate() {
  const t = useTranslations("game");
  const locale = useLocale();
  const [open, setOpen] = useState<ModeId | null>(null);

  const unlocked = GAME_MODES.filter(isPlayable).length;

  return (
    <div aria-label={t("gateAria")} className="mg-root mx-auto w-full max-w-5xl">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("hubTitle")}</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">{t("hubSubtitle")}</p>

      <div className="mg-cab">
        <p className="mg-marquee">{t("gateMarquee")}</p>

        {MODE_GROUPS.map((group) => (
          <div key={group.id}>
            <h2 className="mg-grp">{t(group.labelKey)}</h2>
            <div className="mg-slots">
              {modesInGroup(group.id).map((mode) => (
                <ModeTile
                  key={mode.id}
                  mode={mode}
                  open={open === mode.id}
                  onOpen={(id) => setOpen((prior) => (prior === id ? null : id))}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Where a cabinet prints INSERT COIN. It states the ratio the ticket was about
            rather than hiding it — four of eleven is progress, not a shortfall. */}
        {/* ⚠️ Eastern-Arabic on /ar. The digit rule TASK-1840 settled pins minutes,
            scorelines, shirt numbers and ratings to Western — this is none of those. It
            is a COUNT INSIDE A SENTENCE, which the same rule leaves as prose. */}
        <p className="mg-coin">
          {t("gateUnlocked", {
            n: localizeDigits(unlocked, locale),
            total: localizeDigits(GAME_MODES.length, locale),
          })}
        </p>
      </div>

      <h2 className="text-muted-foreground mt-6 mb-2 font-mono text-[10px] font-bold tracking-widest uppercase">
        {t("groupCollection")}
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {COLLECTION_SURFACES.map((surface) => (
          <div
            key={surface.id}
            className="border-border rounded-full border border-dashed px-3 py-1 text-xs opacity-45"
          >
            <span aria-hidden>{surface.emoji}</span> {t(surface.nameKey)}
            <span className="ms-1 opacity-70">{t("statusPlanned")}</span>
          </div>
        ))}
      </div>

      {/*
        The demo is NOT a mode — it is one fixed match, built at build time, with nothing
        to draft. It stays out of the registry and off the grid for that reason. But when
        this gate took over `/game` it left the broadcast view with no inbound link at
        all, so it gets a quiet line here rather than a tile it would have to pretend to
        earn.
      */}
      <p className="text-muted-foreground mt-5 text-xs">
        <Link href="/game/demo" className="hover:text-foreground underline underline-offset-4">
          {t("watchDemo")}
        </Link>
      </p>
    </div>
  );
}
