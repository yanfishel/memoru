"use client";

import { Notification, Tabs } from "@mantine/core";
import { IconChartBar, IconList, IconMap } from "@tabler/icons-react";
import { useMemo } from "react";
import type { ExploreData } from "@/lib/explore";
import { deserializeLabels, withBaseline, zeroFilled } from "@/lib/explore-state";
import type { ExploreViewId } from "@/lib/filters";
import { UI } from "@/lib/ui-text";
import { ChartsView } from "./ChartsView";
import { FilterBar } from "./FilterBar";
import { MapView } from "./MapView";
import { ResultTable } from "./ResultTable";
import { facetsOf, useFilterSearch } from "./useFilterSearch";
import styles from "./explore.module.css";

const TABS: Array<{ value: ExploreViewId; label: string; Icon: typeof IconChartBar }> = [
  { value: "charts", label: UI.explore.tabs.charts, Icon: IconChartBar },
  { value: "map", label: UI.explore.tabs.map, Icon: IconMap },
  { value: "list", label: UI.explore.tabs.list, Icon: IconList },
];

export function ExploreView({ initial }: { initial: ExploreData }) {
  const { filters, result, notice, pending, change, setPage, setSort, setView, reset } = useFilterSearch(initial);
  const labels = useMemo(() => deserializeLabels(initial.labels), [initial.labels]);
  const facets = facetsOf(result);
  // initial.baselineFacets is an unfiltered distribution computed on the server (loadExplore); it falls
  // back to the first render's own (possibly filtered) facets only when the server couldn't compute one.
  const baseline = initial.baselineFacets ?? facetsOf(initial.result);
  const panelFacets = useMemo(() => withBaseline(baseline, facets, filters), [baseline, facets, filters]);
  // The charts keep every value the baseline knows, at its live count or zero: Meilisearch omits a value
  // with no matches, which made a filter change a chart's height. A zeroed row stays, dimmed instead.
  const chartFacets = useMemo(() => zeroFilled(baseline, facets), [baseline, facets]);

  return (
    <>
      <FilterBar filters={filters} facets={panelFacets} labels={labels} total={result.unavailable ? null : result.total} onChange={change} onReset={reset} />
      {notice && <Notification color="brick" withCloseButton={false} className={styles.notice}>{UI.explore.rateLimited}</Notification>}
      {result.unavailable ? (
        <p role="alert">{result.message}</p>
      ) : (
        <Tabs value={filters.view} onChange={(value) => value && setView(value as ExploreViewId)} keepMounted={false} data-testid="explore-tabs">
          <Tabs.List className={styles.tabs}>
            {TABS.map((tab) => (
              <Tabs.Tab key={tab.value} value={tab.value} leftSection={<tab.Icon size={16} stroke={1.6} />}>
                {tab.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="charts" pt="md">
            <ChartsView facets={chartFacets} labels={labels} total={result.total} pending={pending} />
          </Tabs.Panel>
          <Tabs.Panel value="map" pt="md">
            <MapView facets={facets} labels={labels} onChange={change} />
          </Tabs.Panel>
          <Tabs.Panel value="list" pt="md">
            <ResultTable result={result} filters={filters} labels={labels} pending={pending} onPage={setPage} onSort={setSort} />
          </Tabs.Panel>
        </Tabs>
      )}
    </>
  );
}
