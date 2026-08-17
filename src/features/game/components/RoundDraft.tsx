"use client";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { FORMATIONS, type PoolCard } from "@/features/game/domain/chaos-draft";
import { canField } from "@/features/game/domain/draft-room";
import { formationByName, type Formation } from "@/features/game/domain/formation";
import type { DraftSpec } from "@/features/game/domain/rule-packs";
import { randomSeed } from "@/features/game/view/seed";
import { Link } from "@/i18n/navigation";
import { DraftRoom } from "./DraftRoom";
import { FormationPicker } from "./FormationPicker";

/**
 * The shape the picker opens on.
 *
 * Named rather than taken by position — the array's order is presentation only, so
 * inserting a shape must never silently change what a draft starts with.
 */
const DEFAULT_FORMATION = "4-4-2 Flat";

interface Props {
  pool: PoolCard[];
  draft: DraftSpec;
  onConfirm: (players: PoolCard[], formation: Formation) => void;
  /** Back to the pack's chooser, when it has one. A route, not a callback. */
  backHref?: string;
}

/**
 * TASK-1810 — the owner's round-based draft: **formation, then one round per slot**.
 *
 * The rounds themselves are the shipped Draft Room, running with the pack's `handSize` and
 * `roam`. There is no second draft machine here, and deliberately so: the room already
 * precomputes every hand from `(pool, formation, seed)` and already advances to the next
 * unfilled slot on each pick, so "eleven consecutive rounds of three" is that room with
 * two knobs turned.
 *
 * ⚠️ The seed is drawn in the CLICK HANDLER, never during render. Every `/game/*` route is
 * `force-static`, so entropy at render time would either fail the build or bake one
 * visitor's draft into the CDN copy — the same rule the hub follows.
 */
export function RoundDraft({ pool, draft, onConfirm, backHref }: Props) {
  const t = useTranslations("game");
  const byId = useMemo(() => new Map(pool.map((c) => [c.cardId, c])), [pool]);

  /**
   * Only the shapes this club can actually field.
   *
   * ⚠️ Necessary because `onePerPlayer` collapses a club's cards to its distinct players.
   * Measured across all 51 clubs: 46 can field all 20 shapes, but Barnsley and Oldham each
   * strand three slots of a 2-3-5 Pyramid — five forward slots out of a 26-player history.
   * Offering an unfillable shape would deadlock the draft with no way back.
   */
  const shapes = useMemo(
    () => (draft.onePerPlayer === true ? FORMATIONS.filter((f) => canField(pool, f)) : FORMATIONS),
    [pool, draft.onePerPlayer],
  );

  /**
   * ⚠️ The opening shape must be one the club can FIELD, not a fixed name — the default
   * 4-4-2 is fillable everywhere today, but a picker whose value is not among its options
   * shows a blank control, and the club that breaks it would be some future promoted side
   * nobody tested.
   */
  const [formation, setFormation] = useState<Formation>(
    () => shapes.find((f) => f.name === DEFAULT_FORMATION) ?? shapes[0] ?? formationByName(DEFAULT_FORMATION),
  );
  const [seed, setSeed] = useState<number | null>(null);

  if (seed == null) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <h2 className="text-xl font-extrabold tracking-tight">{t("roomTitle")}</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <FormationPicker value={formation} onChange={setFormation} shapes={shapes} />
          <button
            type="button"
            onClick={() => setSeed(randomSeed())}
            className="bg-primary text-primary-foreground rounded-md px-5 py-2 text-sm font-bold"
          >
            {t("roomStart")}
          </button>
          {backHref != null ? (
            <Link
              href={backHref}
              className="border-border rounded-md border px-4 py-2 text-sm font-semibold"
            >
              {t("modeBack")}
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <DraftRoom
      pool={pool}
      formation={formation}
      seed={seed}
      handSize={draft.handSize}
      roam={draft.roam}
      standout={draft.standout}
      onePerPlayer={draft.onePerPlayer}
      lockPicks={draft.lockPicks}
      // `undefined` would fall through to the room's shipped 15s default, so a pack that
      // declares no clock has to pass the null explicitly.
      limit={draft.timer === undefined ? undefined : draft.timer}
      onComplete={(cardIds) => {
        // Slot order in, slot order out — the container takes it from here, exactly as it
        // does for the hub.
        const players = cardIds
          .map((id) => byId.get(id))
          .filter((c): c is PoolCard => c != null);
        onConfirm(players, formation);
      }}
    />
  );
}
