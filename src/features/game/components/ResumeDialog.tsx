"use client";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

interface Props {
  homeName: string;
  awayName: string;
  score: { home: number; away: number };
  minute: number;
  onResume: () => void;
  onStartOver: () => void;
}

/**
 * The offer to pick a match back up, shown OVER the draft hub.
 *
 * ⚠️ A dialog, deliberately, and not a fifth phase that replaces the screen. The route is
 * `force-static`, so the prerendered HTML holds the hub; replacing it after mount would
 * repeat the PR #97 defect exactly — a painted screen visibly swapped for a different
 * one. Nothing here is swapped. The hub stays, and the dialog arrives on top of it.
 */
export function ResumeDialog({
  homeName,
  awayName,
  score,
  minute,
  onResume,
  onStartOver,
}: Props) {
  const t = useTranslations("game");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    box.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-[radial-gradient(120%_80%_at_50%_-10%,#12202c,#060a0f)] p-6 ring-1 ring-cyan-400/25 outline-none"
      >
        <h2 id="resume-title" className="text-lg font-extrabold tracking-tight text-white">
          {t("playResumeTitle")}
        </h2>

        <div className="my-5 flex items-center justify-center gap-4">
          <span className="flex-1 text-end text-sm font-bold text-white">{homeName}</span>
          <span className="font-mono text-2xl font-black tabular-nums text-cyan-300">
            {score.home}
            {"–"}
            {score.away}
          </span>
          <span className="flex-1 text-start text-sm font-bold text-white">{awayName}</span>
        </div>

        <p className="text-center font-mono text-xs font-bold tracking-widest text-cyan-300/80">
          {minute}
          {"'"}
        </p>

        <p className="text-muted-foreground mt-4 text-sm">{t("playResumeBody")}</p>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onStartOver}
            className="text-muted-foreground rounded-md px-4 py-2 text-sm font-bold"
          >
            {t("playStartOver")}
          </button>
          <button
            type="button"
            onClick={onResume}
            className="bg-primary text-primary-foreground ms-auto rounded-md px-5 py-2 text-sm font-bold"
          >
            {t("playResume")}
          </button>
        </div>
      </div>
    </div>
  );
}
