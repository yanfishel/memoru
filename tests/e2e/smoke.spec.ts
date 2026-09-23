import { expect, test, type APIRequestContext } from "@playwright/test";

interface Hit {
  id: number;
  name: string;
}

/** Any record will do; the first hit of the unfiltered search is stable for one build. */
async function firstHit(request: APIRequestContext): Promise<Hit> {
  const response = await request.get("/api/search");
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { hits: Hit[] };
  expect(body.hits.length).toBeGreaterThan(0);
  return body.hits[0];
}

test("home page shows the hero, the headline numbers and the search box", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Найти имя");
  await expect(page.getByTestId("stat-persons")).not.toHaveText("0");
  await expect(page.getByRole("search")).toBeVisible();
  await expect(page.getByText(/Состояние данных/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "История в цифрах" })).toBeVisible();
});

test("home page: the opening band is full width and gives the page no horizontal scroll", async ({ page }) => {
  // The band reaches past `.page` with `margin-inline: calc(50% - 50vw)`, and `100vw` counts the
  // scrollbar, so without `body { overflow-x: clip }` the whole page gains a horizontal scrollbar.
  await page.goto("/");
  for (const width of [1400, 400]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  }
  // Hero and stat cards share one band, so the cards sit inside it rather than below it.
  const band = page.locator("main > div").first();
  await expect(band.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(band.getByTestId("stat-persons")).toBeVisible();
});

const meta = (page: import("@playwright/test").Page, selector: string) =>
  page.locator(selector).first().getAttribute("content");

test("metadata: the site names itself, not the database it presents", async ({ page }) => {
  // Regression for the title that read "Открытый список — статистика": that is a separate project,
  // credited in the footer and on /about, never this site's own name.
  await page.goto("/");
  await expect(page).toHaveTitle(/^MEMOru —/);
  expect(await meta(page, 'meta[property="og:site_name"]')).toBe("MEMOru");
  expect(await meta(page, 'meta[property="og:title"]')).toMatch(/^MEMOru —/);
  expect(await meta(page, 'meta[name="twitter:card"]')).toBe("summary_large_image");
  expect(await meta(page, 'meta[property="og:locale"]')).toBe("ru_RU");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  // The description credits the source without claiming to be it.
  expect(await meta(page, 'meta[name="description"]')).toContain("Открытый список");
});

test("metadata: a name search is offered from the search engine's own listing", async ({ page }) => {
  await page.goto("/");
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}");
  expect(ld["@type"]).toBe("WebSite");
  expect(ld.potentialAction.target.urlTemplate).toContain("/search?q={search_term_string}");
});

test("metadata: query-driven pages carry a clean canonical and stay out of the index", async ({ page }) => {
  for (const path of ["/explore?sex=f", "/search?q=Иванов"]) {
    await page.goto(path);
    expect(await meta(page, 'meta[name="robots"]')).toContain("noindex");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).not.toContain("?");
  }
});

test("metadata: a person page carries its own card, and the card renders as a PNG", async ({ page, request }) => {
  const hit = await firstHit(request);
  await page.goto(`/person/${hit.id}`);
  expect(await meta(page, 'meta[property="og:type"]')).toBe("profile");
  expect(await meta(page, 'meta[property="og:title"]')).toContain(hit.name.split(" ")[0]);
  const card = await meta(page, 'meta[property="og:image"]');
  expect(card).toContain("opengraph-image");
  const png = await request.get(card!);
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toBe("image/png");
  // Satori draws nothing legible without the Cyrillic font handed in; an empty-ish PNG means the
  // font failed to load, which no status code would reveal.
  expect((await png.body()).length).toBeGreaterThan(10_000);
});

test("explore: a quick add-chip filters, the chip appears and its remove button clears it", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByText(/^Найдено/)).toBeVisible();
  await page.getByTestId("add-filter-sentence_type").click();
  await page.getByRole("checkbox", { name: /^расстрел/ }).check();
  await expect(page).toHaveURL(/sentence_type=vmn/);
  const chip = page.getByTestId("filter-chip").filter({ hasText: "Приговор: расстрел" });
  await expect(chip).toBeVisible();
  await chip.getByRole("button").click();
  await expect(page).not.toHaveURL(/sentence_type=/);
  await expect(page.getByTestId("filter-chip")).toHaveCount(0);
});

test("explore: a filtered URL opened directly still lists the other values in the popover", async ({ page }) => {
  // Regression for the baseline-collapse bug: loadExplore's first render is itself filtered when the
  // URL already carries a filter (reload, shared link, Back/Forward), and without a server-computed
  // baseline the popover would show only the selected nationality instead of every sibling.
  await page.goto("/explore?nationality=russian");
  await expect(page.getByText(/^Найдено/)).toBeVisible();
  await page.getByTestId("add-filter-nationality").click();
  await expect(page.getByRole("checkbox", { name: /^русские/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /^немцы/ })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^немцы/ })).not.toBeChecked();
});

test("explore: the map view is reachable from the header and the list view sorts through the URL", async ({ page }) => {
  await page.goto("/");
  // Scoped to the header nav landmark: the footer's own middle column now repeats this link text
  // (SiteFooter.tsx).
  await page.getByRole("navigation", { name: "Основная навигация" }).getByRole("link", { name: "Карта" }).click();
  await expect(page).toHaveURL(/\/explore\?view=map/);
  await expect(page.getByTestId("map-layer")).toBeVisible();
  await page.getByRole("tab", { name: "Список" }).click();
  await expect(page).toHaveURL(/view=list/);
  // The list is already name-ascending by default (no `sort` in the URL), so a first click on "Имя"
  // toggles straight to descending instead of re-asserting the order already showing.
  await page.getByTestId("sort-name").click();
  await expect(page).toHaveURL(/sort=name/);
  await expect(page).toHaveURL(/dir=desc/);
  await expect(page.getByTestId("result-table").getByRole("columnheader", { name: /Имя/ })).toHaveAttribute("aria-sort", "descending");
  // A second click flips back to ascending — the default direction, so it drops out of the URL again.
  await page.getByTestId("sort-name").click();
  await expect(page).not.toHaveURL(/dir=desc/);
  await expect(page.getByTestId("result-table").getByRole("columnheader", { name: /Имя/ })).toHaveAttribute("aria-sort", "ascending");
});

test("explore: the header's Карта link switches the view even from the page's own charts tab", async ({ page }) => {
  // Regression for a bug found by reproduction: `useFilterSearch` mirrors state into the URL but only
  // ever reads it back on `popstate` — a same-route `next/link` navigation (this header link, while
  // already on /explore) moves the URL and re-renders the page's `initial` prop without a popstate or a
  // remount, so the hook used to keep showing the old tab even once the URL read `?view=map`.
  await page.goto("/explore");
  const headerNav = page.getByRole("navigation", { name: "Основная навигация" });
  await expect(page.getByRole("tab", { name: "Графики" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Год ареста" })).toBeVisible();

  await headerNav.getByRole("link", { name: "Карта" }).click();
  await expect(page).toHaveURL(/\/explore\?view=map/);
  await expect(page.getByTestId("map-layer")).toBeVisible();
  // The charts tab's own content must be gone, not merely hidden behind the map (Tabs keepMounted={false}).
  await expect(page.getByRole("region", { name: "Год ареста" })).toHaveCount(0);

  // Neighbour: the header's own "Цифры" link switches back from the map to the charts the same way.
  await headerNav.getByRole("link", { name: "Цифры" }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByRole("region", { name: "Год ареста" })).toBeVisible();
  await expect(page.getByTestId("map-layer")).toHaveCount(0);

  // Back and Forward still work across these same-route navigations.
  await page.goBack();
  await expect(page).toHaveURL(/\/explore\?view=map/);
  await expect(page.getByTestId("map-layer")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByRole("region", { name: "Год ареста" })).toBeVisible();
});

test("search: the table lists people and an impossible query shows the empty state", async ({ page, request }) => {
  const hit = await firstHit(request);
  await page.goto(`/search?q=${encodeURIComponent(hit.name)}`);
  await expect(page.getByTestId("result-table")).toBeVisible();
  await expect(page.locator(`a[href^="/person/${hit.id}-"]`).first()).toBeVisible();
  await page.goto("/search?q=zzzzqqqq");
  await expect(page.getByTestId("empty-result")).toBeVisible();
});

test("name search finds a record and its page renders with metadata", async ({ page, request }) => {
  const hit = await firstHit(request);
  await page.goto(`/search?q=${encodeURIComponent(hit.name)}`);
  // Located by id-scoped href, not by accessible name: on a 3.3M-record dataset two people can
  // share a full name, and /search?q= may list the other one first.
  const link = page.locator(`a[href^="/person/${hit.id}-"]`).first();
  await expect(link).toBeVisible();
  await expect(link).toHaveText(hit.name);

  await page.goto(`/person/${hit.id}`);
  await expect(page).toHaveURL(new RegExp(`/person/${hit.id}-`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(hit.name);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/person/${hit.id}-`));
  await expect(page.getByRole("link", { name: "Страница в Открытом списке" })).toHaveAttribute("href", /ru\.openlist\.wiki/);
});

test("a missing record is a 404", async ({ request }) => {
  const response = await request.get("/person/999999999");
  expect(response.status()).toBe(404);
});

test("theme menu switches the colour scheme and the choice survives a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("theme-menu").click();
  await page.getByRole("menuitem", { name: "Тёмная" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mantine-color-scheme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-mantine-color-scheme", "dark");
  await page.getByTestId("theme-menu").click();
  await page.getByRole("menuitem", { name: "Светлая" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mantine-color-scheme", "light");
});

test("header links: the map item points at the explore map view and the about page renders", async ({ page }) => {
  await page.goto("/");
  // Scoped to the header nav landmark: the footer's own middle column now repeats this link text
  // (SiteFooter.tsx).
  const headerNav = page.getByRole("navigation", { name: "Основная навигация" });
  await expect(headerNav.getByRole("link", { name: "Карта" })).toHaveAttribute("href", "/explore?view=map");
  await page.getByRole("link", { name: "О проекте" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("О проекте");
});

test("the header is in the prerendered HTML of the static home page", async ({ request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).toContain('data-testid="theme-menu"');
  expect(html).toContain('href="/search"');
});

test("the 404 page offers the name search", async ({ page }) => {
  await page.goto("/person/999999999");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Страница не найдена");
  await page.getByRole("search").getByRole("searchbox").fill("Иванов");
  // Name the submit button explicitly: once the field has text, the clear button that appears next
  // to it is also a `role=button` inside the same `search` landmark.
  await page.getByRole("search").getByRole("button", { name: "Найти" }).click();
  await expect(page).toHaveURL(/\/search\?q=/);
});

test("sitemap index, first chunk and robots", async ({ request }) => {
  const index = await request.get("/sitemap.xml");
  expect(index.ok()).toBe(true);
  expect(await index.text()).toContain("<sitemapindex");
  const chunk = await request.get("/sitemap/0.xml");
  expect(chunk.ok()).toBe(true);
  expect(await chunk.text()).toContain("<urlset");
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Sitemap:");
});

test("explore: switching tabs sends no search request", async ({ page }) => {
  await page.goto("/explore");
  const found = page.getByText(/^Найдено/);
  await expect(found).toBeVisible();
  const before = await found.textContent();
  // The tab is client-only state: the API never sees `view`, so a tab click must not refetch.
  const searched = page
    .waitForRequest((request) => request.url().includes("/api/search"), { timeout: 1500 })
    .then(() => "sent", () => "none");
  await page.getByRole("tab", { name: "Список" }).click();
  expect(await searched).toBe("none");
  await expect(found).toHaveText(before ?? "");
});

test("list view pages through results", async ({ page }) => {
  await page.goto("/explore?view=list");
  await expect(page.getByTestId("result-table")).toBeVisible();
  await page.getByRole("button", { name: "Дальше" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText(/^26–50/)).toBeVisible();
});

test("list view sorts alphabetically by default, and the Имя column shows it", async ({ page }) => {
  // Regression for the id-order bug: with no `sort` in the URL the list must still read as "А…" first
  // (spec default: alphabetical by surname), not the insertion order the ETL happens to number rows in.
  await page.goto("/explore?view=list");
  const firstRow = page.getByTestId("result-table").locator("tbody tr").first();
  await expect(firstRow.locator("td").first()).toContainText(/^А/);
  await expect(page.getByTestId("result-table").getByRole("columnheader", { name: /Имя/ })).toHaveAttribute("aria-sort", "ascending");
  // The URL itself stays clean: the default is expressed where the sort is built, not pinned as ?sort=name.
  await expect(page).not.toHaveURL(/sort=/);
});

test("list view: a name query ranks by relevance, not the alphabetical default", async ({ page }) => {
  // Regression: INDEX_SETTINGS.rankingRules puts `sort` ahead of relevance (documents.ts), so sending
  // the alphabetical default alongside a query used to override it — a search for "Максимов Петр"
  // returned "Абаев Андрей Максимович", "Абакумов Максим Васильевич", … (31 445 hits, none of them the
  // person searched for) instead of the actual name matches. With no explicit sort, a non-empty query
  // must send no `sort` clause at all, so Meilisearch's own relevance ranking decides the order.
  await page.goto(`/explore?view=list&q=${encodeURIComponent("Максимов Петр")}`);
  await expect(page.getByTestId("result-table")).toBeVisible();
  const firstName = await page.getByTestId("result-table").locator("tbody tr").first().locator("td").first().innerText();
  expect(firstName).toContain("Максимов");
  expect(firstName).toContain("Петр");
  // No column claims to be driving the order: it's relevance, not "Имя" (or anything else).
  const nameHeader = page.getByTestId("result-table").getByRole("columnheader", { name: /Имя/ });
  await expect(nameHeader).not.toHaveAttribute("aria-sort", "ascending");
  await expect(nameHeader).not.toHaveAttribute("aria-sort", "descending");
});

test("list view: the whole row opens the person, a real link keeps it keyboard-reachable, and ctrl/middle-click still open a new tab", async ({
  page,
  context,
}) => {
  await page.goto("/explore?view=list");
  const row = page.getByTestId("result-table").locator("tbody tr").first();
  const link = row.getByRole("link");
  const name = await link.textContent();
  const href = await link.getAttribute("href");
  const id = href!.match(/^\/person\/(\d+)/)![1];

  // Keyboard: Tab reaches the name as a real link (not a div-soup row), and Enter navigates it. The
  // link's accessible name is the person's name alone — the photo icon (if any) sits outside it.
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/person/${id}-`));
  await page.goBack();
  await expect(page.getByTestId("result-table")).toBeVisible();

  // Mouse: a plain click elsewhere in the row (the "born" cell, no link of its own) still navigates —
  // the row's onClick defers to the link only when the click actually landed on it.
  const row2 = page.getByTestId("result-table").locator("tbody tr").first();
  await row2.locator("td").nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/person/${id}-`));
  await page.goBack();
  await expect(page.getByTestId("result-table")).toBeVisible();

  // Ctrl-click on the name link still opens a new tab, natively, exactly as it did before the row became
  // clickable. The new tab starts at about:blank while Chromium hands off the navigation, so this waits
  // for the URL itself (toHaveURL polls) rather than racing `waitForLoadState()` against that handoff.
  const row3 = page.getByTestId("result-table").locator("tbody tr").first();
  const [ctrlTab] = await Promise.all([context.waitForEvent("page"), row3.getByRole("link").click({ modifiers: ["Control"] })]);
  await expect(ctrlTab).toHaveURL(new RegExp(`/person/${id}-`));
  await ctrlTab.close();
  await expect(page).toHaveURL(/\/explore\?view=list/);

  // Middle-click on the name link opens a new tab too.
  const [middleTab] = await Promise.all([context.waitForEvent("page"), row3.getByRole("link").click({ button: "middle" })]);
  await expect(middleTab).toHaveURL(new RegExp(`/person/${id}-`));
  await middleTab.close();

  expect(name).toBeTruthy();
});

test("person page: narrative, timeline, badges and similar-records block render", async ({ page, request }) => {
  const hit = await firstHit(request);
  await page.goto(`/person/${hit.id}`);
  await expect(page.getByTestId("person-narrative")).not.toBeEmpty();
  await expect(page.getByTestId("person-timeline").getByRole("listitem")).toHaveCount(5);
  await expect(page.getByTestId("person-badges").getByText(/Реабилит/)).toBeVisible();
});

test("person page: a photo renders beside the narrative, and a broken image hides the whole figure", async ({ page }) => {
  // Id 15 (Абиссов Александр Афанасьевич) is the brief's own worked example for photoUrl and has a
  // real photo_file in the rebuilt data (only ~1.3 % of records do, so this can't use firstHit).
  await page.goto("/person/15");
  const photo = page.getByTestId("person-photo");
  await expect(photo).toBeVisible();
  await expect(photo.locator("img")).toHaveAttribute("src", /ru\.openlist\.wiki\/images\//);

  // A fresh navigation with the image route failing: 2026-09-17 review found the plain `onError`
  // handler could miss a failure that happens before hydration (force-dynamic page, image at the top
  // of the SSR'd HTML, browser starts fetching during parse) and PersonPhoto now also checks on
  // mount via a ref callback — this is the one promised behaviour ("no broken-image icon ever") with
  // no other automated coverage.
  await page.route("**/ru.openlist.wiki/images/**", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/person/15");
  await expect(page.getByTestId("person-narrative")).not.toBeEmpty();
  await expect(page.getByTestId("person-photo")).toHaveCount(0);
});

test("person page: share popover opens and copies the link", async ({ page, request, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const hit = await firstHit(request);
  await page.goto(`/person/${hit.id}`);
  await page.getByTestId("action-share").click();
  await expect(page.getByRole("link", { name: "Telegram" })).toHaveAttribute("href", /t\.me\/share/);
  await page.getByTestId("share-copy").click();
  await expect(page.getByTestId("share-copy")).toHaveText("Скопировано");
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toMatch(new RegExp(`/person/${hit.id}-`));
});
