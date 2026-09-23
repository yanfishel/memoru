"use client";

import { Notification } from "@mantine/core";
import { useMemo } from "react";
import { SearchBox } from "@/components/SearchBox";
import { FilterBar } from "@/components/explore/FilterBar";
import { ResultTable } from "@/components/explore/ResultTable";
import { facetsOf, useFilterSearch } from "@/components/explore/useFilterSearch";
import type { ExploreData } from "@/lib/explore";
import { deserializeLabels, withBaseline } from "@/lib/explore-state";
import { UI } from "@/lib/ui-text";
import styles from "./search.module.css";

/**
 * `/search`: the name form on top (a plain GET form, so it works before hydration and without JavaScript),
 * the shared filter bar and the result table. Charts and the map stay on `/explore`.
 */
export function SearchView({ initial }: { initial: ExploreData }) {
  const { filters, result, notice, pending, change, setPage, setSort, reset } = useFilterSearch(initial);
  const labels = useMemo(() => deserializeLabels(initial.labels), [initial.labels]);
  const facets = facetsOf(result);
  // Same fix as ExploreView: initial.baselineFacets is the server's unfiltered facet distribution
  // (loadExplore), so a filtered URL (e.g. a shared /search?nationality=... link) doesn't collapse the
  // popover to the current selection.
  const panelFacets = useMemo(
    () => withBaseline(initial.baselineFacets ?? facetsOf(initial.result), facets, filters),
    [initial.baselineFacets, initial.result, facets, filters],
  );

  return (
    <>
      <div className={styles.searchWrap}>
        <SearchBox
          key={filters.q}
          defaultValue={filters.q}
          autoFocus
          onSubmit={(value) => change({ kind: "q", q: value })}
        />
      </div>
      <FilterBar filters={filters} facets={panelFacets} labels={labels} total={result.unavailable ? null : result.total} onChange={change} onReset={reset} />
      {notice && <Notification color="brick" withCloseButton={false} className={styles.notice}>{UI.explore.rateLimited}</Notification>}
      {result.unavailable ? (
        <p role="alert">{result.message}</p>
      ) : (
        <ResultTable result={result} filters={filters} labels={labels} pending={pending} onPage={setPage} onSort={setSort} />
      )}
    </>
  );
}
