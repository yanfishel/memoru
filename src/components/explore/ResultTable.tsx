"use client";

import { EmptyState, Pagination, Skeleton, Table, Tooltip } from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconArrowsSort, IconPhoto, IconSearchOff } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LabelMap } from "@/db/queries";
import { effectiveSortKey, type FilterState, type SortKey } from "@/lib/filters";
import { formatInt } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/paging";
import { personPath } from "@/lib/person-url";
import { labelOf } from "@/lib/person-view";
import { isPlainLeftClick } from "@/lib/row-click";
import type { SearchResult } from "@/lib/search";
import { UI } from "@/lib/ui-text";
import styles from "./result-table.module.css";

const T = UI.explore.table;

interface Column {
  key: string;
  title: string;
  sort?: SortKey;
}

const COLUMNS: Column[] = [
  { key: "name", title: T.name, sort: "name" },
  { key: "born", title: T.born, sort: "birth_year" },
  { key: "arrested", title: T.arrested, sort: "arrest_year" },
  { key: "sentence", title: T.sentence },
  { key: "region", title: T.region },
  // Last, unheaded: it carries the photo mark only (2026-09-18 review).
  { key: "photo", title: "" },
];

/** A coded cell reads as an em dash when the source has no value: "не указано"/"не распознано" are
 * the person page's wording, too heavy for a table where a year already shows "—" (2026-09-18 review). */
function cellLabel(labels: LabelMap, field: string, code: string): string {
  return code === "unknown" || code === "unrecognized" ? "—" : labelOf(labels, field, code);
}

export function ResultTable({
  result,
  filters,
  labels,
  pending,
  onPage,
  onSort,
}: {
  result: SearchResult;
  filters: FilterState;
  labels: LabelMap;
  pending: boolean;
  onPage: (page: number) => void;
  onSort: (key: SortKey) => void;
}) {
  const router = useRouter();
  if (result.total === 0 && !pending) {
    return (
      <EmptyState icon={<IconSearchOff size={40} stroke={1.4} />} title={T.empty} description={T.emptyHint} data-testid="empty-result" />
    );
  }
  const first = (result.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(result.total, result.page * PAGE_SIZE);

  // The row's own click handler: it defers to the name link for anything the link would already
  // handle itself (a click landing on it — including ctrl/middle-click opening a new tab natively) and
  // for anything that isn't a plain left click elsewhere in the row (a modifier held, a non-primary
  // button), leaving both alone rather than guessing at a new-tab equivalent for a click on plain text.
  function handleRowClick(event: React.MouseEvent<HTMLTableRowElement>, href: string) {
    if ((event.target as HTMLElement).closest("a")) return;
    if (!isPlainLeftClick(event)) return;
    router.push(href);
  }

  return (
    <section className={styles.wrap} aria-busy={pending}>
      <Table className={styles.table} data-testid="result-table" highlightOnHover verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            {COLUMNS.map((column) => {
              const sortable = column.sort !== undefined && result.sortable.includes(column.sort);
              // A deep link can name a key this index cannot sort on: the request drops it (`toMeiliSort`),
              // so the header must not claim an order the rows are not in. Same reasoning covers the
              // query case: `effectiveSortKey` answers null for a non-empty query with no explicit sort
              // (the rows are in relevance order then), so no column shows as active.
              const active = sortable && effectiveSortKey(filters) === column.sort;
              const Icon = active ? (filters.dir === "asc" ? IconArrowUp : IconArrowDown) : IconArrowsSort;
              return (
                <Table.Th key={column.key} aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : undefined}>
                  {column.sort === undefined ? (
                    column.title
                  ) : (
                    <Tooltip label={sortable ? T.sortBy(column.title) : T.unsortable}>
                      <button
                        type="button"
                        className={styles.sortButton}
                        // `aria-disabled`, not `disabled`: a disabled button takes no pointer events, so the
                        // tooltip explaining why the column cannot be sorted would never open.
                        aria-disabled={!sortable}
                        data-disabled={!sortable || undefined}
                        onClick={() => sortable && column.sort && onSort(column.sort)}
                        aria-label={T.sortBy(column.title)}
                        data-testid={`sort-${column.sort}`}
                      >
                        {column.title}
                        <Icon size={14} stroke={1.6} className={styles.sortIcon} />
                      </button>
                    </Tooltip>
                  )}
                </Table.Th>
              );
            })}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {pending && result.hits.length === 0
            ? Array.from({ length: 5 }, (_, i) => (
                <Table.Tr key={`skeleton-${i}`}>
                  {COLUMNS.map((column) => (
                    <Table.Td key={column.key}><Skeleton height={14} /></Table.Td>
                  ))}
                </Table.Tr>
              ))
            : result.hits.map((hit) => {
                const href = personPath(hit.id, hit.name);
                return (
                  <Table.Tr key={hit.id} className={styles.row} onClick={(event) => handleRowClick(event, href)}>
                    <Table.Td data-label={T.name}>
                      {/* Visually plain text (spec: the row is the link now), but a real <a>: this is
                          what keeps the row keyboard-reachable (Tab lands here) and gives screen
                          readers a "link, <name>" announcement instead of a silent table cell. */}
                      <Link href={href} className={styles.name}>{hit.name}</Link>
                    </Table.Td>
                    <Table.Td data-label={T.born} className="tnum">{hit.birth_year ?? "—"}</Table.Td>
                    <Table.Td data-label={T.arrested} className="tnum">{hit.arrest_year ?? "—"}</Table.Td>
                    <Table.Td data-label={T.sentence}>{cellLabel(labels, "sentence_type", hit.sentence_type)}</Table.Td>
                    <Table.Td data-label={T.region}>{cellLabel(labels, "source_region", hit.source_region_code)}</Table.Td>
                    {/* The mark stands for a fact — "this person has a photo" — so it keeps an
                        accessible name instead of being hidden from a screen reader. */}
                    <Table.Td className={styles.photoCell}>
                      {hit.has_photo && <IconPhoto size={19} stroke={1.6} role="img" aria-label={T.hasPhoto} className={styles.photoIcon} />}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
        </Table.Tbody>
      </Table>
      {result.total > 0 && (
        <div className={styles.footer}>
          <span className={`${styles.range} tnum`}>{T.range(formatInt(first), formatInt(last), formatInt(result.total))}</span>
          {result.pages > 1 && (
            <Pagination
              className={styles.pagination}
              total={result.pages}
              value={result.page}
              onChange={onPage}
              siblings={1}
              boundaries={1}
              getControlProps={(control) => ({ "aria-label": T.pager[control] })}
            />
          )}
        </div>
      )}
    </section>
  );
}
