"use client";

import { QueryClient, QueryClientProvider, isServer } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, type ReactNode } from "react";

/**
 * The query defaults, per environment.
 *
 * ⛔ `gcTime` is 5 minutes in the BROWSER ONLY — on the server it is `Infinity`, TanStack's own
 * server default, which schedules NO garbage-collection timer (2026-10-12).
 *
 * This provider sits in the root layout, so every prerendered page makes a server-side
 * QueryClient. With a finite `gcTime` each one scheduled a 5-minute `setTimeout`, and a Node
 * timer captures the AsyncLocalStorage context of the render that created it — so every page
 * the build had finished stayed fully in memory (its RSC payload buffers, its stream chunks)
 * for five minutes. Measured: two pending timers per rendered page, ~1 GB of finished pages
 * pinned per worker, "JavaScript heap out of memory" around page 12,500 of 19,161 locally, and
 * on Vercel a garbage-collection stall that ran the production build into the 45-minute limit.
 * A server QueryClient lives for exactly one render, so there is nothing to garbage-collect.
 */
export function queryDefaults(server: boolean) {
  return {
    staleTime: 60 * 1000,
    gcTime: server ? Infinity : 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  };
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: queryDefaults(isServer) } });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (isServer) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
