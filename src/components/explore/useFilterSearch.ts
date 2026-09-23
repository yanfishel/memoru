"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExploreData } from "@/lib/explore";
import { applyChange, resetFilters, setSort as applySort, setView as applyView, type Facets, type FilterChange } from "@/lib/explore-state";
import { DEFAULT_VIEW, parseFilters, serializeFilters, type ExploreViewId, type FilterState, type SortKey } from "@/lib/filters";
import type { SearchResult, SearchUnavailable } from "@/lib/search";

/** A history entry per keystroke would make Back useless, so filter changes are batched into one. */
const HISTORY_DEBOUNCE_MS = 300;

/** Defensive about the shape: a response body that is not a search result must not break the view. */
export function facetsOf(result: SearchResult | SearchUnavailable): Facets {
  if (result.unavailable) return {};
  return (result.facets as Facets | undefined) ?? {};
}

export interface FilterSearch {
  filters: FilterState;
  result: SearchResult | SearchUnavailable;
  /** The last request was refused (rate limited); the previous result stays on screen. */
  notice: boolean;
  pending: boolean;
  change: (change: FilterChange) => void;
  setPage: (page: number) => void;
  setSort: (key: SortKey) => void;
  setView: (view: ExploreViewId) => void;
  reset: () => void;
}

/**
 * The filter state of `/explore` and `/search`: mirrors it into the URL (pushState, debounced; replaceState
 * for the normalised first URL), follows Back/Forward, and fetches `/api/search` on every change. The server
 * has already rendered `initial`; the first fetch happens on the first real change. `view` is a client-only
 * `/explore` tab selection the API does not know about: changing it alone still moves the URL (so the tab
 * survives a reload or a shared link) but never triggers a new fetch.
 *
 * `initial` itself is a second way the URL can change from outside a keystroke or a click inside this
 * component: a header link or any other `next/link`/`router.push` to `/explore` with a different query
 * re-renders the page on the server (it reads `searchParams`) and hands this hook a new `initial` — without
 * remounting it, so the `useState` below keeps the old `filters` unless told otherwise. That prop change is
 * treated the same way a popstate is (see the effect below): authoritative, via `fromHistory`, never fought
 * by the debounced pushState effect. The hook's own writes go through raw `history.pushState`, which never
 * re-renders the server component, so this can't loop back on itself.
 */
export function useFilterSearch(initial: ExploreData): FilterSearch {
  const [filters, setFilters] = useState<FilterState>(initial.filters);
  const [result, setResult] = useState<SearchResult | SearchUnavailable>(initial.result);
  const [notice, setNotice] = useState(false);
  const [pending, setPending] = useState(false);
  const abort = useRef<AbortController | null>(null);
  /** Tracks the query the API was last asked for — with `view` forced to its default, since a view-only
      change reserializes to a different URL but must not trigger a new fetch (see the fetch effect below). */
  const applied = useRef(serializeFilters({ ...initial.filters, view: DEFAULT_VIEW }));
  /** The last full URL (view included) the fetch effect has already handled — mount, a pushed change, or a
      popstate — so a run that finds nothing new at all (mount, Strict Mode's dev double-invoke, re-clicking
      the already-active tab) can skip both the history write and the fetch instead of just the fetch. */
  const appliedUrl = useRef(serializeFilters(initial.filters));
  /** Marks the one state update this hook makes from an event handler on popstate, so the URL write below is skipped. */
  const fromHistory = useRef(false);
  const historyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // The URL as typed need not be the URL these filters serialise to (a clamped page, an unknown key).
    // replaceState is right here and only here: the reader never navigated to the unnormalised form.
    const query = appliedUrl.current;
    if (window.location.search.replace(/^\?/, "") !== query) {
      window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
    }
    return () => {
      if (historyTimer.current) clearTimeout(historyTimer.current);
    };
  }, []);

  useEffect(() => {
    // Back and Forward move the URL under the view; re-parsing it is what makes the browser buttons work.
    const onPopState = () => {
      fromHistory.current = true;
      setFilters(parseFilters(new URLSearchParams(window.location.search)));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    // A new `initial` is only ever handed down by a fresh server render of `/explore` (a header link, a
    // `router.push`, or a Back/Forward that Next's own router resolved) — never by this hook's own history
    // writes (see the hook's doc comment). `appliedUrl` already names the URL this hook has applied, so
    // comparing against it is what tells a real external navigation apart from the one that ran this same
    // effect on mount (where `initial` is the very value `appliedUrl` was seeded from, below) and from a
    // popstate that reached `initial` before this effect got a chance to run.
    const url = serializeFilters(initial.filters);
    if (url === appliedUrl.current) return;
    // Next's own client-side router cache can still hand down a stale `initial` here: this hook's raw
    // `history.pushState` writes (the debounced one below, and this branch's own history) are invisible to
    // Next's router history, so on a Back/Forward past one of those entries Next can restore *its* cached
    // tree for a route it last actually navigated to — not the one the address bar now shows — racing the
    // popstate effect above, which already parsed the live URL correctly. The address bar is the one thing
    // both sources agree on when they agree at all, so it is the tiebreaker: an `initial` that does not
    // match it is stale and must be ignored, not applied over a correct restore.
    if (url !== window.location.search.replace(/^\?/, "")) return;
    fromHistory.current = true;
    // Deferred to a microtask — still ahead of the next paint, so there is nothing to see flash — rather
    // than called straight from the effect body: a setState called synchronously and unconditionally from
    // one of an effect's own dependencies is exactly the "adjusting state when a prop changes" shape the
    // `set-state-in-effect` lint rule flags, and its own fix (a callback, not the effect body itself) is
    // what this is.
    queueMicrotask(() => setFilters(initial.filters));
  }, [initial]);

  useEffect(() => {
    // `url` keeps `view` for the address bar; `query` forces it to the default so a view-only change
    // compares equal to the last fetched query below and is not mistaken for "the state changed".
    const url = serializeFilters(filters);
    const query = serializeFilters({ ...filters, view: DEFAULT_VIEW });
    // Nothing at all changed since the last run (mount; Strict Mode's dev double-invoke; re-clicking the
    // active tab; two effect runs landing on the same URL): skip history and fetch alike. A popstate is
    // exempted even when its destination URL happens to equal this ref — it still needs the branch below
    // to reset `fromHistory` — so this never eats a real navigation.
    if (url === appliedUrl.current && !fromHistory.current) return;
    appliedUrl.current = url;
    if (historyTimer.current) clearTimeout(historyTimer.current);
    if (fromHistory.current) {
      // The browser has already moved its cursor for this state; pushing would bury the entry
      // the reader just went back to.
      fromHistory.current = false;
    } else {
      // The native history API updates the URL without re-running this page on the server, which would
      // otherwise search twice per change and hand the view a narrower facet baseline than it started with.
      const href = url ? `?${url}` : window.location.pathname;
      historyTimer.current = setTimeout(() => window.history.pushState(null, "", href), HISTORY_DEBOUNCE_MS);
    }
    // The URL changed, but only in `view` (already handled above): the search itself is unaffected.
    const queryUnchanged = query === applied.current;
    applied.current = query;
    if (queryUnchanged) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPending(true);
    fetch(`/api/search?${query}`, { signal: controller.signal })
      .then(async (response) => ({ ok: response.ok, body: (await response.json()) as Partial<SearchUnavailable> }))
      .then(({ ok, body }) => {
        if (controller.signal.aborted) return;
        setPending(false);
        // 503 answers with a search result shape; 429 (rate limited) answers with neither, so the last
        // good result stays on screen and the reader is told to wait instead of seeing a broken view.
        if (!ok && body.unavailable !== true) {
          setNotice(true);
          return;
        }
        setNotice(false);
        setResult(body as SearchResult | SearchUnavailable);
      })
      .catch(() => {
        /* aborted or network failure: keep the previous result on screen */
        if (!controller.signal.aborted) setPending(false);
      });
  }, [filters]);

  const change = useCallback((c: FilterChange) => setFilters((state) => applyChange(state, c)), []);
  const setPage = useCallback((page: number) => setFilters((state) => ({ ...state, page })), []);
  const setSort = useCallback((key: SortKey) => setFilters((state) => applySort(state, key)), []);
  const setView = useCallback((view: ExploreViewId) => setFilters((state) => applyView(state, view)), []);
  const reset = useCallback(() => setFilters((state) => resetFilters(state)), []);

  return { filters, result, notice, pending, change, setPage, setSort, setView, reset };
}
