"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { crestOf } from "@/features/game/domain/coach";
import { loadProfile, type CoachProfile } from "@/features/game/storage/profile-slot";
import { Link } from "@/i18n/navigation";
import { CrestBadge } from "./CrestBadge";

/**
 * TASK-1827 — the mode gate's welcome. A first-time visitor (no profile in this browser) is
 * offered the 30-second rescue; a returning coach is greeted by name and crest.
 *
 * ⚠️ Read AFTER mount, like every other piece of local state on a force-static page: the
 * prerender has no IndexedDB, so the server HTML carries neither greeting.
 */
export function CoachBanner() {
  const t = useTranslations("gameOnboarding");
  const [state, setState] = useState<{ loaded: boolean; profile: CoachProfile | null }>({
    loaded: false,
    profile: null,
  });
  useEffect(() => {
    let live = true;
    void loadProfile().then((profile) => {
      if (live) setState({ loaded: true, profile });
    });
    return () => {
      live = false;
    };
  }, []);

  if (!state.loaded) return null;
  if (state.profile == null) {
    return (
      <Link href="/game/start" className="cb-new" data-testid="coach-banner-new">
        <b>{t("bannerNew")}</b>
        <span>{t("bannerNewDesc")}</span>
      </Link>
    );
  }
  return (
    <div className="cb-back" data-testid="coach-banner">
      <CrestBadge crest={crestOf(state.profile.crest)} size={32} />
      <span>{t("bannerBack", { coach: state.profile.name })}</span>
      <Link href="/game/start" className="cb-replay">
        {t("bannerReplay")}
      </Link>
    </div>
  );
}
