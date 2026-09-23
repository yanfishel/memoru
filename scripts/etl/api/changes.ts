import { ApiHttpError, type ApiClient } from "./client";

export interface ChangedPages {
  pageIds: number[];
  lastTimestamp: string | null;
  revisions: number;
}

interface AllRevisionsPage {
  pageid: number;
  title: string;
  revisions?: Array<{ revid: number; timestamp: string }>;
}

interface AllRevisionsBody {
  query?: { allrevisions?: AllRevisionsPage[] };
  continue?: { arvcontinue?: string };
}

const PAGE_SIZE = "500";

export async function listChangedPages(
  client: ApiClient,
  since: string,
  // excludeUser: MediaWiki's arvexcludeuser (PARAM_TYPE user) takes exactly
  // one user name, not a list.
  options: { limit?: number; onProgress?: (seen: number) => void; excludeUser?: string } = {},
): Promise<ChangedPages> {
  const seen = new Set<number>();
  const pageIds: number[] = [];
  let lastTimestamp: string | null = null;
  let revisions = 0;
  let cont: string | undefined;

  for (;;) {
    const body = (await client.query({
      list: "allrevisions",
      arvdir: "newer",
      arvnamespace: "0",
      arvstart: since,
      arvlimit: PAGE_SIZE,
      arvprop: "ids|timestamp",
      ...(options.excludeUser ? { arvexcludeuser: options.excludeUser } : {}),
      ...(cont ? { arvcontinue: cont } : {}),
    })) as AllRevisionsBody;

    for (const page of body.query?.allrevisions ?? []) {
      if (!seen.has(page.pageid)) {
        seen.add(page.pageid);
        pageIds.push(page.pageid);
      }
      for (const revision of page.revisions ?? []) {
        revisions++;
        if (lastTimestamp === null || revision.timestamp > lastTimestamp) {
          lastTimestamp = revision.timestamp;
        }
      }
    }
    options.onProgress?.(revisions);

    cont = body.continue?.arvcontinue;
    if (!cont) break;
    if (options.limit !== undefined && revisions >= options.limit) break;
  }

  return { pageIds, lastTimestamp, revisions };
}

export interface LogChanges {
  deletedPageIds: number[];
  // title + the event's own timestamp: a title match alone cannot tell a
  // still-deleted page from one recreated later at the same title, and the
  // two sync streams can now be runs apart (see sync.ts's title sweep).
  deletedEvents: Array<{ title: string; timestamp: string }>;
  lastTimestamp: string | null;
}

interface LogEvent {
  type: string;
  action: string;
  title?: string;
  pageid?: number;
  logpage?: number;
  timestamp: string;
}

interface LogEventsBody {
  query?: { logevents?: LogEvent[] };
  continue?: { lecontinue?: string };
}

// logpage is the id of the page the event was about; pageid is the id of
// whatever page currently sits at that title (0 after a move with a
// suppressed redirect, or an unrelated page's id after delete-then-recreate).
// Prefer logpage so we track the page the event actually happened to.
function resolvePageId(pageid: number | undefined, logpage: number | undefined): number | undefined {
  if (typeof logpage === "number" && logpage > 0) {
    return logpage;
  }
  if (typeof pageid === "number" && pageid > 0) {
    return pageid;
  }
  return undefined;
}

async function listLogType(
  client: ApiClient,
  letype: string,
  since: string,
  limit: number | undefined,
): Promise<{ events: LogEvent[]; lastTimestamp: string | null }> {
  const events: LogEvent[] = [];
  let lastTimestamp: string | null = null;
  let cont: string | undefined;
  // The live wiki returns HTTP 500 for some continuations at lelimit=500 but
  // succeeds at lelimit=50. Fall back to the smaller page size on a 5xx and
  // retry the same continuation, then go back to 500 once a page succeeds.
  let pageSize = "500";

  for (;;) {
    let body: LogEventsBody;
    try {
      body = (await client.query({
        list: "logevents",
        letype,
        ledir: "newer",
        lestart: since,
        lenamespace: "0",
        lelimit: pageSize,
        ...(cont ? { lecontinue: cont } : {}),
      })) as LogEventsBody;
    } catch (error) {
      if (error instanceof ApiHttpError && error.status >= 500 && pageSize === "500") {
        pageSize = "50";
        continue;
      }
      throw error;
    }
    pageSize = "500";

    for (const event of body.query?.logevents ?? []) {
      events.push(event);
      if (lastTimestamp === null || event.timestamp > lastTimestamp) lastTimestamp = event.timestamp;
    }

    cont = body.continue?.lecontinue;
    if (!cont) break;
    if (limit !== undefined && events.length >= limit) break;
  }

  return { events, lastTimestamp };
}

// Moves are not walked here: a MediaWiki page move writes a null revision on
// the moved page, so list=allrevisions already surfaces it, and the content
// fetch upserts the page under its new title. Walking letype=move would be
// redundant, and on this wiki a stretch of the move log (2025-01-31
// 17:27-17:55) returns HTTP 500 at every page size anyway.
export async function listLogChanges(
  client: ApiClient,
  since: string,
  options: { limit?: number } = {},
): Promise<LogChanges> {
  const deletions = await listLogType(client, "delete", since, options.limit);

  const deletedPageIds: number[] = [];
  const deletedEvents: Array<{ title: string; timestamp: string }> = [];
  for (const event of deletions.events) {
    if (event.action !== "delete") continue; // ignore restore/revision-delete entries
    const id = resolvePageId(event.pageid, event.logpage);
    if (id !== undefined) deletedPageIds.push(id);
    if (event.title) deletedEvents.push({ title: event.title, timestamp: event.timestamp });
  }

  return {
    deletedPageIds,
    deletedEvents,
    lastTimestamp: deletions.lastTimestamp,
  };
}
