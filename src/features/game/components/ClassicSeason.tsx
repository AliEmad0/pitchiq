"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ClassicData } from "../domain/classic-data";
import { classicTeams, nextClassicFixture, restoreClassic } from "../view/classic-session";
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

export function ClassicSeason({ seasons }: { seasons: number[] }) {
  const t = useTranslations("gameClassic");
  const [season, setSeason] = useState(2003);
  const [clubId, setClubId] = useState(42);
  const [shape, setShape] = useState("4-4-2 Flat");
  const [cards, setCards] = useState<string[] | undefined>();
  const [saved, setSaved] = useState<SavedClassic | null>(null);
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
    loadClassicSave()
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
  }, [retry]);
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
        return { ...restoreClassic(data, saved), clubId: saved.clubId, shape: saved.formation };
      const club = data.squads.find((c) => c.teamId === clubId) ?? data.squads[0];
      const formation = club.formations.includes(shape) ? shape : club.formations[0];
      return {
        teams: classicTeams(data, club.teamId, formation, cards),
        run: { seed: 0, coach: data.clubIds.indexOf(club.teamId), results: [] },
        clubId: club.teamId,
        shape: formation,
      };
    } catch {
      return null;
    }
  }, [data, saved, clubId, shape, cards]);
  async function persist(next: SavedClassic) {
    setSaved(next);
    try {
      await saveClassic(next);
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
      if (!data || !prepared) return;
      const own = prepared.teams[prepared.run.coach];
      await persist({
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
      await persist({
        ...saved,
        results: [...advanceClassic(data.schedule, prepared.teams, prepared.run).results],
      });
    });
  const remove = () => {
    if (!abandon) {
      setAbandon(true);
      return;
    }
    void transact(async () => {
      await clearClassic();
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
            const current = restoreClassic(data, saved);
            if (result.seed !== playing.setup.seed) throw new Error("Wrong Classic fixture result");
            const next = advanceClassic(data.schedule, current.teams, current.run, {
              fixtureId: playing.id,
              homeGoals: result.score.home,
              awayGoals: result.score.away,
            });
            await persist({ ...saved, results: [...next.results] });
            setPlaying(null);
          });
        }}
      />
    );
  const invalid = data != null && prepared == null;
  return (
    <>
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
          <ClassicOrbit
            data={data}
            teams={prepared.teams}
            run={prepared.run}
            seasons={seasons}
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
            onCards={setCards}
            onStart={start}
            onSim={step}
            onAbandon={remove}
            onPlay={() => {
              if (!saved || !data || lock.current || error) return;
              returned.current = false;
              setPlaying(nextClassicFixture(data, saved));
            }}
          />
        )
      )}
    </>
  );
}
