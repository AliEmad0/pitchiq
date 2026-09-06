"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ClassicData } from "../domain/classic-data";
import {
  classicTeams,
  nextClassicFixture,
  restoreClassic,
  rotateClassic,
} from "../view/classic-session";
import { advanceClassic } from "../view/classic-run";
import { randomSeed } from "../view/seed";
import {
  clearClassic,
  loadClassicSave,
  saveClassic,
  type SavedClassic,
} from "../storage/classic-slot";
import { SeasonFixturePlay } from "./SeasonFixturePlay";
import { ClassicOrbit } from "./ClassicOrbit";
import { SurvivalLifeline } from "./SurvivalLifeline";
import {
  clearSurvival,
  loadSurvivalSave,
  saveSurvival,
  type SavedSurvival,
} from "../storage/survival-slot";
import {
  survivalCandidates,
  scenarioFor,
  restoreSurvival,
  nextSurvivalFixture,
  rotateSurvival,
} from "../view/survival-session";
import { advanceSurvival, type SurvivalRun } from "../view/survival-run";
type SavedHistorical = SavedClassic | SavedSurvival;

export function ClassicSeason({ seasons }: { seasons: number[] }) {
  const t = useTranslations("gameSurvival");
  const [objective, setObjective] = useState<"classic" | "survival" | null>(null);
  useEffect(() => {
    const sync = () =>
      setObjective(
        new URLSearchParams(window.location.search).get("objective") === "survival"
          ? "survival"
          : "classic",
      );
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  if (!objective) return null;
  return (
    <>
      <nav aria-label={t("objective")} className="mx-auto flex max-w-7xl gap-4 p-4">
        {(["classic", "survival"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className="border-b-2 border-transparent px-3 py-2 aria-pressed:border-current aria-pressed:font-semibold"
            aria-pressed={objective === value}
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set("objective", value);
              window.history.pushState(null, "", url);
              setObjective(value);
            }}
          >
            {t(value)}
          </button>
        ))}
      </nav>
      <HistoricalSeason key={objective} seasons={seasons} survival={objective === "survival"} />
    </>
  );
}

function HistoricalSeason({ seasons, survival }: { seasons: number[]; survival: boolean }) {
  const t = useTranslations("gameClassic");
  const st = useTranslations("gameSurvival");
  const [season, setSeason] = useState(2003);
  const [clubId, setClubId] = useState(42);
  const [shape, setShape] = useState("4-4-2 Flat");
  const [cards, setCards] = useState<string[] | undefined>();
  const [saved, setSaved] = useState<SavedHistorical | null>(null);
  const [data, setData] = useState<ClassicData | null>(null);
  const [booted, setBooted] = useState(false);
  const [error, setError] = useState<"load" | "save" | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [abandon, setAbandon] = useState(false);
  const [playing, setPlaying] = useState<ReturnType<typeof nextClassicFixture>>(null);
  const lock = useRef(false);
  const returned = useRef(false);
  useEffect(() => {
    let live = true;
    (survival ? loadSurvivalSave() : loadClassicSave())
      .then((value) => {
        if (!live) return;
        setSaved(value);
        if (value) {
          setSeason(value.season);
          setClubId(value.clubId);
          setShape(value.formation);
        }
        setBooted(true);
        setError(null);
      })
      .catch(() => {
        if (live) setError("load");
      });
    return () => {
      live = false;
    };
  }, [retry, survival]);
  useEffect(() => {
    if (!booted) return;
    const controller = new AbortController();
    setData(null);
    fetch(`/api/game/classic/${season}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Classic unavailable");
        const value: ClassicData = await res.json();
        if (value.season !== season || !Array.isArray(value.squads) || !value.squads.length)
          throw new Error("Invalid season response");
        if (!controller.signal.aborted) {
          setData(value);
          setError(null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("load");
      });
    return () => controller.abort();
  }, [booted, season, retry]);
  const prepared = useMemo(() => {
    if (!data) return null;
    try {
      if (saved)
        return {
          ...(survival
            ? restoreSurvival(data, saved as SavedSurvival)
            : restoreClassic(data, saved)),
          clubId: saved.clubId,
          shape: saved.formation,
        };
      const candidates = survival ? survivalCandidates(data) : data.clubIds;
      const selected = candidates.includes(clubId) ? clubId : candidates[0];
      const club = data.squads.find((c) => c.teamId === selected);
      if (!club) return null;
      const formation = club.formations.includes(shape) ? shape : club.formations[0];
      return {
        teams: classicTeams(data, club.teamId, formation, cards),
        unavailable: false,
        run: {
          seed: 0,
          coach: data.clubIds.indexOf(club.teamId),
          results: [],
          ...(survival ? { scenario: scenarioFor(data, club.teamId) } : {}),
        },
        clubId: club.teamId,
        shape: formation,
      };
    } catch {
      return null;
    }
  }, [data, saved, clubId, shape, cards, survival]);
  async function persist(next: SavedHistorical) {
    setSaved(next);
    try {
      if (survival) await saveSurvival(next as SavedSurvival);
      else await saveClassic(next);
      setError(null);
    } catch {
      setError("save");
    }
  }
  async function transact(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await action();
    } catch {
      setError("load");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const start = () =>
    void transact(async () => {
      if (!data || !prepared || error || !booted) return;
      const own = prepared.teams[prepared.run.coach];
      await persist({
        ...(survival ? { scenario: scenarioFor(data, prepared.clubId) } : {}),
        version: 1,
        season: data.season,
        clubId: prepared.clubId,
        formation: prepared.shape,
        cardIds: own.players.map((p) => p.cardId),
        seed: randomSeed(),
        archiveKey: data.archiveKey,
        results: [],
      });
    });
  const step = () =>
    void transact(async () => {
      if (!data || !saved || !prepared || error) return;
      const next = survival
        ? advanceSurvival(
            data.schedule,
            prepared.teams,
            prepared.run as SurvivalRun,
            undefined,
            prepared.unavailable,
          )
        : advanceClassic(
            data.schedule,
            prepared.teams,
            prepared.run,
            undefined,
            prepared.unavailable,
          );
      await persist({ ...saved, results: [...next.results], injuries: next.injuries });
    });
  const remove = () => {
    if (!abandon) {
      setAbandon(true);
      return;
    }
    void transact(async () => {
      if (survival) await clearSurvival();
      else await clearClassic();
      setSaved(null);
      setPlaying(null);
      setCards(undefined);
      setAbandon(false);
      setError(null);
      setBooted(true);
    });
  };
  if (playing && data && saved)
    return (
      <SeasonFixturePlay
        fixture={playing}
        crests={{ home: playing.setup.home.teamId, away: playing.setup.away.teamId }}
        captaincies={{}}
        referees={[]}
        onReturn={(result) => {
          if (returned.current) return;
          returned.current = true;
          if (!result) {
            setPlaying(null);
            return;
          }
          void transact(async () => {
            const current = survival
              ? restoreSurvival(data, saved as SavedSurvival)
              : restoreClassic(data, saved);
            if (result.seed !== playing.setup.seed) throw new Error("Wrong Classic fixture result");
            const played = {
              fixtureId: playing.id,
              homeGoals: result.score.home,
              awayGoals: result.score.away,
              events: result.events,
            };
            const next = survival
              ? advanceSurvival(
                  data.schedule,
                  current.teams,
                  { ...current.run, scenario: (saved as SavedSurvival).scenario },
                  played,
                )
              : advanceClassic(data.schedule, current.teams, current.run, played);
            await persist({ ...saved, results: [...next.results], injuries: next.injuries });
            setPlaying(null);
          });
        }}
      />
    );
  const unsupported = survival && data != null && !saved && survivalCandidates(data).length === 0;
  const invalid = data != null && prepared == null && !unsupported;
  const View = survival ? SurvivalLifeline : ClassicOrbit;

  return (
    <>
      {unsupported && (
        <div role="status" className="p-8">
          <p>{st("unsupported")}</p>
          <label>
            {t("season")}
            <select value={season} onChange={(e) => setSeason(Number(e.target.value))}>
              {seasons.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {(error || invalid) && (
        <div role="alert" className="mx-auto my-4 max-w-4xl rounded border p-4">
          <p>{t(error === "save" ? "saveFailed" : "loadFailed")}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (error === "save" && saved) void transact(() => persist(saved));
              else {
                setBooted(false);
                setRetry((n) => n + 1);
              }
            }}
          >
            {t("retry")}
          </button>
          {" · "}
          <button type="button" disabled={busy} onClick={remove}>
            {t(abandon ? "confirmAbandon" : "abandon")}
          </button>
        </div>
      )}
      {!booted || !data ? (
        <p role="status" className="p-10 text-center">
          {t("loading")}
        </p>
      ) : (
        prepared && (
          <View
            data={data}
            teams={prepared.teams}
            run={prepared.run}
            seasons={seasons}
            unavailable={prepared.unavailable}
            started={saved != null}
            clubId={prepared.clubId}
            shape={prepared.shape}
            busy={busy || error != null}
            abandon={abandon}
            onSeason={(value) => {
              setCards(undefined);
              setSeason(value);
            }}
            onClub={(value) => {
              setCards(undefined);
              setClubId(value);
            }}
            onShape={(value) => {
              setCards(undefined);
              setShape(value);
            }}
            onCards={(values) => {
              if (!saved) {
                setCards(values);
                return;
              }
              if (!data || error || lock.current) return;
              void transact(() =>
                persist(
                  survival
                    ? rotateSurvival(data, saved as SavedSurvival, values)
                    : rotateClassic(data, saved, values),
                ),
              );
            }}
            onStart={start}
            onSim={step}
            onAbandon={remove}
            onPlay={() => {
              if (!saved || !data || lock.current || error) return;
              returned.current = false;
              setPlaying(
                survival
                  ? nextSurvivalFixture(data, saved as SavedSurvival)
                  : nextClassicFixture(data, saved),
              );
            }}
          />
        )
      )}
    </>
  );
}
