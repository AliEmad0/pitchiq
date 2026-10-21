"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { cleanName, CRESTS, crestOf, NAME_MAX, TUTORIAL } from "@/features/game/domain/coach";
import type { Verdict } from "@/features/game/domain/what-if";
import { loadProfile, saveProfile, type CoachProfile } from "@/features/game/storage/profile-slot";
import { Link } from "@/i18n/navigation";
import { CrestBadge } from "./CrestBadge";
import { type WhatIfCard, WhatIf } from "./WhatIf";

type Step = "identity" | "match" | "hook";

/**
 * TASK-1827 — the first run (owner, 2026-10-21): "jump straight into a quick, punchy 30-second
 * rescue … once it's over, they should instantly understand the core hook: PitchIQ isn't a
 * tedious full-season sim, it's an exciting tactical game where your decisions rewrite football
 * history."
 *
 * Three steps, nothing else: a name and a crest (one screen, skippable), the tutorial rescue
 * (`TUTORIAL`, a What-If on a fixed seed with tips), and the hook — what you just did, and where
 * to do it again. Everything lives in this browser; there is no account.
 */
export function Onboarding({ card }: { card: WhatIfCard }) {
  const t = useTranslations("gameOnboarding");
  const [step, setStep] = useState<Step>("identity");
  const [name, setName] = useState("");
  const [crest, setCrest] = useState(CRESTS[0]!.id);
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [outcome, setOutcome] = useState<{
    score: { home: number; away: number };
    verdict: Verdict;
  } | null>(null);

  // A returning coach replaying the tutorial keeps his name and crest pre-filled.
  useEffect(() => {
    let live = true;
    void loadProfile().then((p) => {
      if (!live || p == null) return;
      setProfile(p);
      setName(p.name);
      setCrest(p.crest);
    });
    return () => {
      live = false;
    };
  }, []);

  const commit = async (tutorialDone: boolean) => {
    const next: CoachProfile = {
      name: cleanName(name) || t("defaultName"),
      crest,
      createdAt: profile?.createdAt ?? new Date().toISOString(),
      tutorialDone: tutorialDone || profile?.tutorialDone === true,
    };
    setProfile(next);
    await saveProfile(next);
    return next;
  };

  if (step === "identity") {
    return (
      <section className="ob-root" data-testid="ob-identity">
        <p className="ob-kicker">{t("kicker")}</p>
        <h1 className="ob-title">{t("title")}</h1>
        <p className="ob-sub">{t("subtitle")}</p>
        <label className="ob-label" htmlFor="ob-name">
          {t("nameLabel")}
        </label>
        <input
          id="ob-name"
          className="ob-input"
          value={name}
          maxLength={NAME_MAX}
          placeholder={t("namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="ob-label">{t("crestLabel")}</p>
        <div className="ob-crests" role="radiogroup" aria-label={t("crestLabel")}>
          {CRESTS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={crest === c.id}
              aria-label={t(`crest.${c.id}`)}
              className="ob-crest"
              onClick={() => setCrest(c.id)}
            >
              <CrestBadge crest={c} size={44} />
            </button>
          ))}
        </div>
        <div className="ob-actions">
          <button
            type="button"
            className="ob-go"
            data-testid="ob-start"
            onClick={() => {
              void commit(false).then(() => setStep("match"));
            }}
          >
            {t("start")}
          </button>
          <Link
            href="/game"
            className="ob-skip"
            data-testid="ob-skip"
            onClick={() => {
              void commit(false);
            }}
          >
            {t("skip")}
          </Link>
        </div>
      </section>
    );
  }

  if (step === "match") {
    return (
      <div data-testid="ob-match">
        <p className="ob-brief">
          {t("brief", { coach: profile?.name ?? (cleanName(name) || t("defaultName")) })}
        </p>
        <WhatIf
          cards={[card]}
          tutorial={{
            scenarioId: TUTORIAL.scenarioId,
            seed: TUTORIAL.seed,
            onFinish: (r) => {
              setOutcome(r);
              void commit(true);
              setStep("hook");
            },
          }}
        />
      </div>
    );
  }

  const won = outcome?.verdict === "rewrote";
  const c = crestOf(profile?.crest ?? crest);
  return (
    <section className="ob-root ob-hook" data-testid="ob-hook" data-verdict={outcome?.verdict}>
      <CrestBadge crest={c} size={64} />
      <h1 className="ob-title">{won ? t("hookWon") : t("hookLost")}</h1>
      <p className="ob-sub">
        {t("hookScore", {
          home: card.home.name,
          away: card.away.name,
          score: `${outcome?.score.home ?? 0}–${outcome?.score.away ?? 0}`,
        })}
      </p>
      <p className="ob-hook-line">{t("hookLine")}</p>
      <ul className="ob-next">
        <li>
          <Link href="/game/whatif" className="ob-card" data-testid="ob-next-whatif">
            <b>{t("nextWhatIf")}</b>
            <span>{t("nextWhatIfDesc")}</span>
          </Link>
        </li>
        <li>
          <Link href="/game/daily" className="ob-card">
            <b>{t("nextDaily")}</b>
            <span>{t("nextDailyDesc")}</span>
          </Link>
        </li>
        <li>
          <Link href="/game/weekly" className="ob-card">
            <b>{t("nextWeekly")}</b>
            <span>{t("nextWeeklyDesc")}</span>
          </Link>
        </li>
      </ul>
      <Link href="/game" className="ob-skip">
        {t("allModes")}
      </Link>
    </section>
  );
}
