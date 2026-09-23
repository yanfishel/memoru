import { SaxesParser } from "saxes";

export interface DumpPage {
  pageId: number;
  title: string;
  revId: number;
  revTimestamp: string;
  text: string;
}

interface Revision {
  revId: number;
  timestamp: string;
  text: string;
}

interface PageState {
  title: string;
  ns: number;
  pageId: number;
  latest: Revision | null;
}

/**
 * Streams a MediaWiki XML export and yields main-namespace pages.
 * History dumps contain every revision; only the one with the highest id is kept.
 */
export async function* readDumpPages(
  input: AsyncIterable<string | Uint8Array> | Iterable<string | Uint8Array>,
): AsyncGenerator<DumpPage> {
  const parser = new SaxesParser();
  const decoder = new TextDecoder("utf-8");
  const ready: DumpPage[] = [];
  const path: string[] = [];
  let buffer = "";
  let page: PageState | null = null;
  let revision: Revision | null = null;

  parser.on("opentag", (tag) => {
    path.push(tag.name);
    buffer = "";
    if (tag.name === "page") {
      page = { title: "", ns: -1, pageId: 0, latest: null };
    } else if (tag.name === "revision") {
      revision = { revId: 0, timestamp: "", text: "" };
    }
  });

  parser.on("text", (text) => {
    buffer += text;
  });

  parser.on("closetag", (tag) => {
    path.pop();
    const parent = path[path.length - 1];
    const currentPage = page as PageState | null;
    const currentRevision = revision as Revision | null;

    if (parent === "page" && currentPage) {
      if (tag.name === "title") currentPage.title = buffer;
      else if (tag.name === "ns") currentPage.ns = Number(buffer);
      else if (tag.name === "id") currentPage.pageId = Number(buffer);
    } else if (parent === "revision" && currentRevision) {
      if (tag.name === "id") currentRevision.revId = Number(buffer);
      else if (tag.name === "timestamp") currentRevision.timestamp = buffer;
      else if (tag.name === "text") currentRevision.text = buffer;
    }

    if (tag.name === "revision" && currentPage && currentRevision) {
      if (!currentPage.latest || currentRevision.revId > currentPage.latest.revId) {
        currentPage.latest = currentRevision;
      }
      revision = null;
    } else if (tag.name === "page" && currentPage) {
      if (currentPage.ns === 0 && currentPage.latest) {
        ready.push({
          pageId: currentPage.pageId,
          title: currentPage.title,
          revId: currentPage.latest.revId,
          revTimestamp: currentPage.latest.timestamp,
          text: currentPage.latest.text,
        });
      }
      page = null;
    }
    buffer = "";
  });

  for await (const chunk of input) {
    parser.write(typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true }));
    while (ready.length > 0) yield ready.shift()!;
  }
  parser.write(decoder.decode());
  parser.close();
  while (ready.length > 0) yield ready.shift()!;
}
