"use client";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { GamePlayer } from "@/features/game/domain/player";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { prefersReducedMotion } from "@/utils/motion";
import { PlayerCard } from "./PlayerCard";

interface Props {
  legalOff: GamePlayer[];
  legalOn: GamePlayer[];
  /** Who the engine would take off. Surfaced as a flag, never pre-selected. */
  suggestedOff?: number;
  captainId: number | null;
  onConfirm: (off: number, on: number) => void;
  onClose: () => void;
}

/**
 * TASK-1810 — the substitution popup.
 *
 * ⛔ Nothing on screen uninvited. This mounts ONLY when the coach presses Bench. The
 * shipped `DecisionPrompt` appears unbidden and blocks the match, which is the complaint
 * that produced this redesign — it remains the path for the other packs.
 *
 * Every player is a CARD, not a list row. Confirm stays disabled until both an off and an
 * on are chosen, and the dialog closes three ways: Close, Not now, Escape.
 */
export function BenchDialog({
  legalOff,
  legalOn,
  suggestedOff,
  captainId,
  onConfirm,
  onClose,
}: Props) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();
  const [off, setOff] = useState<number | null>(null);
  const [on, setOn] = useState<number | null>(null);

  // The third way out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pickList = (
    players: GamePlayer[],
    chosen: number | null,
    choose: (id: number) => void,
    kind: "off" | "on",
  ) => (
    <div className="lg-bench-grid">
      {players.map((p) => (
        // ⛔ The wrapper is positioned and the hit target is a SIBLING overlay, never a
        // button inside the card: a card that is itself a <button> throws away a nested
        // one, and a control inside PlayerCard's 3D flip does not hit-test reliably.
        <div
          key={p.cardId}
          className={`lg-bench-card${chosen === p.playerId ? " lg-bench-picked" : ""}`}
        >
          <PlayerCard card={p as EnrichedCard} reduced={reduced} interactive={false} />
          <div className="lg-bench-flags">
            {kind === "off" && p.playerId === suggestedOff ? (
              <span className="lg-flag lg-flag-sug">{t("benchSuggested")}</span>
            ) : null}
            {p.playerId === captainId ? (
              <span className="lg-flag lg-flag-cap">{t("benchCaptain")}</span>
            ) : null}
          </div>
          <button
            type="button"
            className="lg-bench-hit"
            aria-pressed={chosen === p.playerId}
            aria-label={t(kind === "off" ? "benchTakeOff" : "benchBringOn", { name: p.name })}
            onClick={() => choose(p.playerId)}
          />
        </div>
      ))}
    </div>
  );

  const nothingToDo = legalOff.length === 0 || legalOn.length === 0;

  return (
    <div className="lg-veil" role="dialog" aria-modal="true" aria-label={t("benchPanelTitle")}>
      <div className="lg-bench">
        <div className="lg-bench-head">
          <h2 className="lg-bench-title">{t("benchPanelTitle")}</h2>
          <button type="button" onClick={onClose} className="lg-ghost">
            {t("benchClose")}
          </button>
        </div>

        {nothingToDo ? (
          // A side with an empty bench, or one already at its substitution limit. Say so
          // rather than showing two empty grids and a dead Confirm.
          <p className="lg-bench-none">{t("benchNothing")}</p>
        ) : (
          <>
            <h3 className="lg-h2">{t("benchComingOff")}</h3>
            {pickList(legalOff, off, setOff, "off")}
            <h3 className="lg-h2">{t("benchGoingOn")}</h3>
            {pickList(legalOn, on, setOn, "on")}
          </>
        )}

        <div className="lg-bench-go">
          <button type="button" onClick={onClose} className="lg-ghost">
            {t("benchNotNow")}
          </button>
          <button
            type="button"
            // ⛔ Dead until BOTH are chosen.
            disabled={off == null || on == null}
            onClick={() => {
              if (off != null && on != null) onConfirm(off, on);
            }}
            className="lg-confirm"
          >
            {t("benchConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
