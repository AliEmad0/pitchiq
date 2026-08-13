"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { SearchIcon } from "lucide-react";
import Image from "next/image";
// Locale-aware router (TASK-1606 follow-up): the raw next/navigation router
// doesn't add the `/ar` prefix, so clicking a search result on /ar navigated to
// the English page. next-intl's router prepends the active locale.
import { useRouter } from "@/i18n/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { PlayerSearchHit } from "@/features/players/api";
import { PlayerImage } from "@/features/players/components/PlayerImage";
import { highlightMatch } from "@/utils/highlight";

// Render a name with the query's matched characters bolded (TASK-M31).
// `aria-label={name}` pins the accessible name to the full name — the split
// segments would otherwise have the accname algorithm join them with spaces
// ("Ars" + "enal" → "Ars enal"), which is presentational-only but breaks
// name-based lookups (and screen-reader output).
function HighlightedName({
  name,
  query,
  className,
}: {
  name: string;
  query: string;
  className?: string;
}) {
  return (
    <span className={className} aria-label={name}>
      {highlightMatch(name, query).map((seg, i) =>
        seg.match ? (
          <span key={i} className="text-primary bg-primary/15 rounded-[3px] font-semibold">
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  );
}

// `season` = the newest season each entity has data for (TASK-M08); the result
// link carries it so a historical player/club lands on a populated page.
type TeamHit = { id: number; name: string; logo: string; season: number };
type PlayerHit = PlayerSearchHit & { season: number };
// Manager ids are strings (numeric PL id or `lm-<slug>`); `photo` is a bio URL
// or "" → <PlayerImage> falls back to initials.
type ManagerHit = { id: string; name: string; photo: string; season: number };
type SearchResults = { teams: TeamHit[]; players: PlayerHit[]; managers: ManagerHit[] };

// Min 2 chars mirrors /api/search (team names are short). Debounce matches
// <PlayerSearch> — typing-fast feels instant without over-firing the route.
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(h);
  }, [value, delayMs]);
  return debounced;
}

// Global header command palette (TASK-907). Opens via the header button or the
// ⌘K / Ctrl-K shortcut; searches teams + players in one box and navigates to the
// chosen entity. `shouldFilter={false}` because /api/search already filtered —
// cmdk's own value-filter would otherwise hide player rows whose name doesn't
// contain a team-ish query. Radix Dialog provides focus-trap + escape-to-close.
export function GlobalSearch() {
  const t = useTranslations("search");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, DEBOUNCE_MS);
  const trimmed = debounced.trim();
  const enabled = open && trimmed.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const locale = useLocale();
  const { data, isFetching, isError } = useQuery<SearchResults, Error>({
    queryKey: ["globalSearch", trimmed, locale],
    queryFn: async () => {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(trimmed)}&locale=${encodeURIComponent(locale)}`,
      );
      if (!res.ok) throw new Error(`search_failed:${res.status}`);
      return (await res.json()) as SearchResults;
    },
    enabled,
    staleTime: 60_000,
  });

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const go = useCallback(
    (href: string) => {
      router.push(href);
      close();
    },
    [router, close],
  );

  const teams = data?.teams ?? [];
  const players = data?.players ?? [];
  const managers = data?.managers ?? [];
  const hasResults = teams.length > 0 || players.length > 0 || managers.length > 0;

  return (
    <>
      <button
        type="button"
        aria-label={t("label")}
        onClick={() => setOpen(true)}
        className="ix-glow ix-press inline-flex h-9 items-center gap-2 rounded-md border px-2.5 text-sm text-muted-foreground hover:text-foreground sm:px-3"
      >
        <SearchIcon className="size-4" />
        {/* TASK-M79 — two bands show the label, and the gap between them is
            deliberate. From `lg` to `xl` the header is carrying the pill nav in
            its narrowest form, and this button is the widest thing that can
            give way: dropping the label + hint takes it from 128px to 36px,
            which is the 92px of headroom that lets the pill row sit at 1024px
            comfortably rather than with ~24px to spare. Below `lg` the pills
            are gone and there is room to spare, so the label stays.
            Written as two positive rules over a `hidden` base (rather than a
            later `hidden` overriding an earlier `inline`) so it does not depend
            on Tailwind's variant ordering. */}
        <span className="hidden sm:max-lg:inline xl:inline">{t("label")}</span>
        <kbd className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:max-lg:inline xl:inline">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        {/* ix-halo (TASK-1705): the ⌘K palette gets a standing era-accent
            neon frame. */}
        <DialogContent className="ix-halo overflow-hidden p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">{t("label")}</DialogTitle>
          <DialogDescription className="sr-only">{t("dialogDescription")}</DialogDescription>
          <Command shouldFilter={false}>
            <CommandInput placeholder={t("placeholder")} value={query} onValueChange={setQuery} />
            <CommandList>
              {!enabled && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("typing")}</p>
              )}
              {enabled && isFetching && !data && (
                <p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t("searching")}
                </p>
              )}
              {enabled && isError && (
                <p role="alert" className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t("unavailable")}
                </p>
              )}
              {enabled && !isFetching && !isError && data && !hasResults && (
                <CommandEmpty>{t("noResults")}</CommandEmpty>
              )}
              {teams.length > 0 && (
                <CommandGroup heading={t("teams")}>
                  {teams.map((t) => (
                    <CommandItem
                      key={`team-${t.id}`}
                      value={`team-${t.id}-${t.name}`}
                      onSelect={() => go(`/teams/${t.id}?season=${t.season}`)}
                    >
                      <Image
                        src={t.logo}
                        alt=""
                        width={20}
                        height={20}
                        className="size-5 object-contain"
                        unoptimized
                      />
                      <HighlightedName name={t.name} query={trimmed} className="flex-1 truncate" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {players.length > 0 && (
                <CommandGroup heading={t("players")}>
                  {players.map((p) => (
                    <CommandItem
                      key={`player-${p.id}`}
                      value={`player-${p.id}-${p.name}`}
                      onSelect={() => go(`/players/${p.id}?season=${p.season}`)}
                    >
                      <PlayerImage player={p} size="sm" className="size-7 rounded-full" />
                      <HighlightedName name={p.name} query={trimmed} className="flex-1 truncate" />
                      <span className="ms-2 truncate text-xs text-muted-foreground">
                        {p.team.name}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {managers.length > 0 && (
                <CommandGroup heading={t("managers")}>
                  {managers.map((m) => (
                    <CommandItem
                      key={`manager-${m.id}`}
                      value={`manager-${m.id}-${m.name}`}
                      onSelect={() => go(`/managers/${m.id}?season=${m.season}`)}
                    >
                      <PlayerImage
                        player={{ name: m.name, photo: m.photo || null }}
                        size="sm"
                        className="size-7 rounded-full"
                      />
                      <HighlightedName name={m.name} query={trimmed} className="flex-1 truncate" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
