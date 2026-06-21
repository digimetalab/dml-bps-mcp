# AllStats Search — Integration Guide for BPS MCP Server

> Reverse-engineering results of `searchengine.web.bps.go.id` for integration into the BPS MCP server.
> No API key required. Only a `User-Agent` header is needed.

---

## Table of Contents

- [Overview](#overview)
- [Integration Strategy](#integration-strategy)
- [Search Endpoint](#1-search-endpoint)
- [Deep Search Endpoint](#2-deep-search-endpoint)
- [HTML Parsing Reference](#3-html-parsing-reference)
- [MCP Tool Schemas](#4-mcp-tool-schemas)
- [TypeScript Implementation](#5-typescript-implementation)
- [Workflow Examples](#6-workflow-examples)
- [Comparison: WebAPI vs AllStats](#7-comparison-webapi-vs-allstats)
- [Best Practices](#8-best-practices)

---

## Overview

AllStats Search is BPS's internal search engine with two main features:

| Feature | Description | Unique Value |
|---------|-------------|--------------|
| **Search** | BPS content search (publications, tables, BRS, infographics, microdata, glossary, classifications) | Unified search across all BPS content types |
| **Deep Search** | Full-text search inside BPS PDF publications | **Not available via WebAPI** — this is the killer feature |

### Technical Details

- **Rendering:** Full SSR (Server-Side Rendered) — data embedded directly in HTML
- **Auth:** No API key or cookies needed
- **Requirement:** Only needs a `User-Agent` header (without this → 403)
- **Format:** HTML (requires parsing, no JSON API)

### Minimal Request

```bash
curl -s \
  -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) Chrome/138.0.0.0" \
  "https://searchengine.web.bps.go.id/search?q=inflasi&content=all&mfd=0000"
```

---

## Integration Strategy

### How AllStats Complements BPS WebAPI

```
┌─────────────────────────────────────────────────────────┐
│                  BPS MCP Server                          │
│                                                         │
│  ┌──────────────────┐    ┌────────────────────────┐     │
│  │   BPS WebAPI      │    │  AllStats Search        │     │
│  │   (Primary)       │    │  (Supplementary)        │     │
│  │                   │    │                          │     │
│  │  ✅ Structured    │    │  ✅ Full-text search     │     │
│  │     data (JSON)   │    │     inside publications  │     │
│  │  ✅ Dynamic       │    │  ✅ Unified search       │     │
│  │     tables        │    │     all content types    │     │
│  │  ✅ Export/Import │    │  ✅ No API key           │     │
│  │  ✅ Census data   │    │  ✅ Complete region      │     │
│  │  ✅ SIMDASI       │    │     filter (550+)        │     │
│  │  ❌ Full-text     │    │  ❌ Structured data      │     │
│  │     PDF search    │    │  ❌ May change           │     │
│  └──────────────────┘    └────────────────────────┘     │
│                                                         │
│  Tool routing:                                          │
│  1. "find inflation data" → WebAPI (structured data)    │
│  2. "search in publication" → AllStats Deep Search      │
│  3. "find publications" → AllStats Search               │
│  4. WebAPI fails/empty → Fallback to AllStats Search    │
└─────────────────────────────────────────────────────────┘
```

### When to Use AllStats vs WebAPI

| Use Case | Tool | Reason |
|----------|------|--------|
| Query numeric/table data (inflation 2024, GDP, etc.) | **WebAPI** `list/model/data` | Structured JSON, filterable by variable/period |
| Find publications by topic | **AllStats** `search` | More complete, supports all content types |
| Search text inside PDF publications | **AllStats** `deep_search` | **Only available here** |
| List static tables per domain | **WebAPI** `list/model/statictable` | Structured, has Excel download |
| Search export-import data | **WebAPI** `dataexim` | Dedicated endpoint with HS code filter |
| Discovery — user doesn't know what they're looking for | **AllStats** `search` | Broad search, like Google |
| Fallback when WebAPI returns empty | **AllStats** `search` | Backup plan |

### Recommended Tool Priority

```typescript
// In MCP server handler
async function handleQuery(query: string, intent: string) {
  switch (intent) {
    case "structured_data":
      // Priority: WebAPI → fallback AllStats
      return await tryWebAPI(query) || await allstatsSearch(query);

    case "find_publication":
      // Direct AllStats — richer results
      return await allstatsSearch(query, { content: "publication" });

    case "search_inside_pdf":
      // Only AllStats can do this
      return await allstatsDeepSearch(query, pubId);

    case "discovery":
      // AllStats is better for broad search
      return await allstatsSearch(query);

    default:
      return await allstatsSearch(query);
  }
}
```

---

## 1. Search Endpoint

### URL

```
https://searchengine.web.bps.go.id/search
```

### Parameters

| Parameter | Type     | Required | Default   | Description |
|-----------|----------|----------|-----------|-------------|
| `q`       | `string` | ✅       | —         | Search keyword |
| `content` | `string` | ❌       | `all`     | Content type filter |
| `page`    | `number` | ❌       | `1`       | Page number (10 results per page) |
| `title`   | `number` | ❌       | `0`       | `0` = all fields, `1` = title only |
| `mfd`     | `string` | ❌       | `0000`    | MFD region code |
| `from`    | `string` | ❌       | `all`     | Start year (`all` or `2020`) |
| `to`      | `string` | ❌       | `all`     | End year (`all` or `2024`) |
| `sort`    | `string` | ❌       | `terbaru` | `terbaru` (newest) or `relevansi` |

### Content Types (Verified)

| Value          | UI Label          | Icon                         | Badge Color |
|----------------|-------------------|------------------------------|-------------|
| `all`          | All               | `bi-grid-1x2-fill`          | —           |
| `publication`  | Publication       | `bi-book-fill`               | `indigo`    |
| `table`        | Table             | `bi-file-spreadsheet-fill`   | `teal`      |
| `pressrelease` | BRS               | `bi-clipboard2-data`         | —           |
| `infographic`  | Infographic       | `bi-image`                   | —           |
| `microdata`    | Microdata         | `bi-folder`                  | —           |
| `news`         | News              | `bi-file-earmark-richtext`   | —           |
| `glosarium`    | Metadata          | —                            | —           |
| `kbli2020`     | KBLI 2020         | —                            | —           |
| `kbli2017`     | KBLI 2017         | —                            | —           |
| `kbli2015`     | KBLI 2015         | —                            | —           |
| `kbli2009`     | KBLI 2009         | —                            | —           |

> **Note:** Use `table` (not `statictable`) for the URL parameter. This includes dynamic indicators/tables in search results.

### Domain Codes (MFD) — 550+ Options

The sidebar filter contains a dropdown with 550+ regions:

| Code   | Region                    |
|--------|---------------------------|
| `all`  | All Regions               |
| `0000` | BPS National              |
| `1100` | BPS Aceh Province         |
| `1101` | BPS Simeulue Regency      |
| `1102` | BPS Aceh Singkil Regency  |
| `3100` | BPS DKI Jakarta Province  |
| `3200` | BPS Jawa Barat Province   |
| `3500` | BPS Jawa Timur Province   |
| ...    | (2 digits = province, 4 digits = regency/city) |

> The complete list can be scraped from the `<select>` in the sidebar HTML, or fetched from WebAPI: `GET /v1/api/domain/type/all/key/{KEY}`

### Example Requests

```bash
# All content, newest first
curl -s -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) Chrome/138.0.0.0" \
  "https://searchengine.web.bps.go.id/search?q=statistik+telekomunikasi&content=all&page=1&title=0&mfd=0000&from=all&to=all&sort=terbaru"

# Publications only, by relevance
curl -s -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) Chrome/138.0.0.0" \
  "https://searchengine.web.bps.go.id/search?q=inflasi&content=publication&page=1&title=0&mfd=0000&from=2023&to=2025&sort=relevansi"

# Tables, Jawa Timur
curl -s -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) Chrome/138.0.0.0" \
  "https://searchengine.web.bps.go.id/search?q=PDRB&content=table&page=1&title=0&mfd=3500&from=all&to=all&sort=terbaru"
```

---

## 2. Deep Search Endpoint

### URL

```
https://searchengine.web.bps.go.id/deep
```

### Parameters

| Parameter | Type     | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `q`       | `string` | ✅       | —       | Search keyword inside PDF documents |
| `id`      | `string` | ✅       | —       | Publication ID (24-char hex) |
| `content` | `string` | ✅       | —       | Always `publication` |
| `mfd`     | `string` | ✅       | —       | MFD region code |
| `page`    | `number` | ❌       | `1`     | Results page (not PDF page) |

### How to Get Publication ID

Publication ID is a 24-character hex string obtainable from:

**1. From BPS publication URL:**
```
https://www.bps.go.id/publication/2023/08/31/131385d0253c6aae7c7a59fa/statistik-telekomunikasi-indonesia-2022.html
                                             ^^^^^^^^^^^^^^^^^^^^^^^^
                                             this is the publication ID
```

**Regex:** `/\/publication\/\d{4}\/\d{2}\/\d{2}\/([a-f0-9]{24})\//`

**2. From Search endpoint results (content=publication):**

Each publication result card has a "Deep Search" button with a link containing the `id`:
```html
<a href="https://searchengine.web.bps.go.id/deep?q=...&id=f03b39cd9c6caf1bde7b7887&content=publication&mfd=0000&page=1">
  Deep Search
</a>
```

### Example Request

```bash
curl -s -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) Chrome/138.0.0.0" \
  "https://searchengine.web.bps.go.id/deep?q=akses+internet&id=131385d0253c6aae7c7a59fa&content=publication&mfd=0000&page=1"
```

---

## 3. HTML Parsing Reference

### 3.1 Search Result Card (Verified)

```html
<div class="card-result card border-0 rounded-4 position-relative">
  <div class="card-body">
    <!-- Link + displayed URL -->
    <a href="https://www.bps.go.id/statistics-table/2/MjQxMyMy/..."
       class="text-body-tertiary text-decoration-none mb-1 stretched-link"
       target="_blank">
      <span class="d-inline-block text-truncate col-7">
        https://www.bps.go.id/statistics-table/2/MjQxMyMy/...
      </span>
    </a>
    <!-- Title -->
    <h5 class="fw-medium text-dark mb-1">
      Perkembangan Harga Rata-Rata Emas di Pasaran Jakarta
    </h5>
    <!-- Description -->
    <p class="col-12 text-body-secondary text-truncate mb-2">
      Rata-rata Harga Emas di Provinsi DKI Jakarta...
    </p>
    <!-- Badges -->
    <div class="row">
      <div class="col-auto my-auto h-100">
        <div class="badge rounded-pill fw-normal text-bg-teal py-2 px-3 me-1">
          <i class="bi bi-file-spreadsheet-fill"></i> Indikator
        </div>
        <div class="badge rounded-pill fw-normal text-bg-light py-2 px-3">
          <i class="bi bi-buildings"></i> BPS Pusat
        </div>
      </div>
      <!-- Deep Search button — ONLY for publications -->
      <div class="col-auto border-start">
        <a href="https://searchengine.web.bps.go.id/deep?q=...&id={pub_id}&content=publication&mfd=0000&page=1"
           class="btn btn-sm btn-outline-dark rounded-3 z-2 position-relative">
          <i class="bi bi-search"></i> Deep Search
        </a>
      </div>
    </div>
  </div>
</div>
```

### Selectors — Search

| Data | Selector | Extract |
|------|----------|---------|
| Container | `div.card-result` | iterate |
| URL | `a.stretched-link` | `href` |
| Title | `h5.fw-medium` | text |
| Description | `p.text-body-secondary.text-truncate` | text |
| Content type | first `div.badge` | text (strip `<i>`) |
| Domain | `div.badge.text-bg-light` | text (strip `<i>`) |
| Deep Search link | `a[href*="deep"]` | `href` |
| Publication ID | from deep link | regex `id=([a-f0-9]{24})` |
| Total results | body text | regex `Menampilkan ([\d.]+) hasil` |
| Pagination | `a[onclick*="changePage"]` | max number |

### Badge → Content Type

| Color | Text | Type |
|-------|------|------|
| `text-bg-indigo` | Publication | `publication` |
| `text-bg-teal` | Indicator | `table` |
| `text-bg-light` | BPS Central / BPS Kab. xxx | domain |

### 3.2 Deep Search Result Card (Verified)

```html
<!-- Publication metadata (top of page) -->
<img src="https://web-api.bps.go.id/cover.php?f=..." class="foreground">
<h5 class="card-title fw-semibold">Statistik Telekomunikasi Indonesia 2022</h5>
<p class="card-text text-body-secondary mb-3">
  <i class="bi bi-buildings"></i> Badan Pusat Statistik RI
</p>
<a href="https://www.bps.go.id/publication/..." class="btn btn-info text-white">
  View Publication
</a>

<!-- Total matches -->
<p>Showing 11 pages with keyword "akses internet"</p>

<!-- Each match card -->
<div class="col-lg-6 col-12 card-result card p-0 border-0 rounded-4 mb-2">
  <div class="card-body">
    <div class="d-flex justify-content-between">
      <h6 class="fw-medium text-dark mb-0">Page 74</h6>
      <a class="linkhalaman"
         data-id="1"
         data-page="74"
         data-title="Page 74">View Details</a>
    </div>
    <p id="deskripsi-1" class="d-none">
      Ps //W Ww .Bp S.G O.I D ...
      Kepemilikan <mark>akses</mark> <mark>internet</mark>
      Di Rumah Tangga Tertinggi Di DKI Jakarta...
    </p>
  </div>
</div>

<!-- PDF viewer base URL (in <script>) -->
<script>
  var link = "https://web-api.bps.go.id/download.php?f={token}#page=";
</script>
```

### Selectors — Deep Search

| Data | Selector | Extract |
|------|----------|---------|
| Publication title | `h5.card-title.fw-semibold` | text |
| Publisher | `p.card-text` (with `bi-buildings`) | text |
| Cover | `img.foreground` | `src` |
| Publication URL | `a.btn-info[href*="publication"]` | `href` |
| Total matches | body text | regex `Menampilkan (\d+) halaman` |
| Container | `div.card-result` | iterate |
| Page number | `a.linkhalaman` | `data-page` |
| Excerpt | `p[id^="deskripsi-"]` | text / html |
| Keywords | `p[id^="deskripsi-"] mark` | text |
| PDF base | `<script>` | regex `download\.php\?f=[^#"]*` |
| Pagination | `a[onclick*="changePage"]` | max number |

### OCR Artifact Cleanup

```typescript
const OCR_PATTERNS = [
  /^Ps\s*\/\/\s*W\s*Ww\s*\.Bp\s*S\.G\s*O\.I\s*D\s*/i,
  /^Ht\s*Tp\s*\/\/\s*.*?\.Bp\s*S\s*\.\s*Go\s*\.\s*Id\s*/i,
];

function cleanExcerpt(text: string): string {
  let cleaned = text;
  for (const p of OCR_PATTERNS) cleaned = cleaned.replace(p, "");
  return cleaned.trim();
}
```

---

## 4. MCP Tool Schemas

### Tool: `allstats_search`

```json
{
  "name": "allstats_search",
  "description": "Search BPS statistical content (publications, tables, press releases, infographics, microdata) via AllStats Search. Useful for discovery, finding publications, or as fallback when WebAPI returns empty. No API key needed.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search keyword"
      },
      "content": {
        "type": "string",
        "enum": ["all", "publication", "table", "pressrelease", "infographic", "microdata", "news", "glosarium", "kbli2020", "kbli2017", "kbli2015", "kbli2009"],
        "default": "all",
        "description": "Content type filter"
      },
      "domain": {
        "type": "string",
        "default": "0000",
        "description": "MFD domain code. 'all'=all, '0000'=national, 2-digit=province, 4-digit=regency"
      },
      "page": {
        "type": "number",
        "default": 1,
        "description": "Page number (10 results/page)"
      },
      "title_only": {
        "type": "boolean",
        "default": false,
        "description": "Search title only"
      },
      "year_from": {
        "type": "string",
        "default": "all",
        "description": "From year filter"
      },
      "year_to": {
        "type": "string",
        "default": "all",
        "description": "To year filter"
      },
      "sort": {
        "type": "string",
        "enum": ["terbaru", "relevansi"],
        "default": "terbaru",
        "description": "Sort order"
      }
    },
    "required": ["query"]
  }
}
```

### Tool: `allstats_deep_search`

```json
{
  "name": "allstats_deep_search",
  "description": "Full-text search inside a BPS publication PDF. Returns matching pages with excerpts. Get publication_id from allstats_search results. No API key needed.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Keyword to search inside publication"
      },
      "publication_id": {
        "type": "string",
        "description": "24-char hex ID from publication URL or search results",
        "pattern": "^[a-f0-9]{24}$"
      },
      "domain": {
        "type": "string",
        "default": "0000",
        "description": "MFD domain code"
      },
      "page": {
        "type": "number",
        "default": 1,
        "description": "Result page (not PDF page)"
      }
    },
    "required": ["query", "publication_id"]
  }
}
```

---

## 5. TypeScript Implementation

### Fetch Helper

```typescript
const ALLSTATS_BASE = "https://searchengine.web.bps.go.id";
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) Chrome/138.0.0.0";

async function fetchAllStats(path: string, params: Record<string, string>): Promise<string> {
  const url = new URL(path, ALLSTATS_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!res.ok) throw new Error(`AllStats HTTP ${res.status}`);
  return res.text();
}
```

### Search Parser

```typescript
import * as cheerio from "cheerio";

interface SearchResult {
  url: string;
  title: string;
  description: string;
  content_type: string;
  domain: string;
  deep_search_id?: string;
}

interface SearchResponse {
  query: string;
  total_results: number;
  current_page: number;
  total_pages: number;
  results: SearchResult[];
}

async function allstatsSearch(params: {
  query: string;
  content?: string;
  domain?: string;
  page?: number;
  title_only?: boolean;
  year_from?: string;
  year_to?: string;
  sort?: string;
}): Promise<SearchResponse> {
  const html = await fetchAllStats("/search", {
    q: params.query,
    content: params.content || "all",
    page: String(params.page || 1),
    title: params.title_only ? "1" : "0",
    mfd: params.domain || "0000",
    from: params.year_from || "all",
    to: params.year_to || "all",
    sort: params.sort || "terbaru",
  });

  const $ = cheerio.load(html);

  // Total results: "Menampilkan 4.079 hasil pencarian dalam 0.367 detik"
  const totalMatch = $("body").text().match(/Menampilkan\s+([\d.]+)\s+hasil pencarian/);
  const total_results = totalMatch ? parseInt(totalMatch[1].replace(/\./g, "")) : 0;

  // Pagination
  const pages: number[] = [];
  $("a[onclick*='changePage']").each((_, el) => {
    const m = $(el).attr("onclick")?.match(/changePage\((\d+)\)/);
    if (m) pages.push(parseInt(m[1]));
  });
  const total_pages = pages.length > 0 ? Math.max(...pages) : 1;

  // Results
  const results: SearchResult[] = [];
  $("div.card-result").each((_, el) => {
    const $c = $(el);
    const url = $c.find("a.stretched-link").attr("href") || "";
    const title = $c.find("h5.fw-medium").text().trim();
    const description = $c.find("p.text-body-secondary.text-truncate").text().trim();

    const badges = $c.find("div.badge");
    const content_type = badges.first().text().trim();
    const domain = $c.find("div.badge.text-bg-light").text().trim() || badges.last().text().trim();

    let deep_search_id: string | undefined;
    const deepHref = $c.find('a[href*="deep"]').attr("href");
    if (deepHref) {
      const m = deepHref.match(/id=([a-f0-9]{24})/);
      if (m) deep_search_id = m[1];
    }

    results.push({ url, title, description, content_type, domain, deep_search_id });
  });

  return { query: params.query, total_results, current_page: params.page || 1, total_pages, results };
}
```

### Deep Search Parser

```typescript
interface DeepSearchMatch {
  page_number: number;
  excerpt: string;
  highlights: string[];
  pdf_viewer_url: string;
}

interface DeepSearchPublication {
  title: string;
  publisher: string;
  cover_url: string;
  publication_url: string;
  pdf_download_base: string;
}

interface DeepSearchResponse {
  query: string;
  publication: DeepSearchPublication;
  total_matches: number;
  current_page: number;
  total_pages: number;
  matches: DeepSearchMatch[];
}

function cleanExcerpt(text: string): string {
  return text
    .replace(/^Ps\s*\/\/\s*W\s*Ww\s*\.Bp\s*S\.G\s*O\.I\s*D\s*/i, "")
    .replace(/^Ht\s*Tp\s*\/\/\s*.*?\.Bp\s*S\s*\.\s*Go\s*\.\s*Id\s*/i, "")
    .trim();
}

async function allstatsDeepSearch(params: {
  query: string;
  publication_id: string;
  domain?: string;
  page?: number;
}): Promise<DeepSearchResponse> {
  const html = await fetchAllStats("/deep", {
    q: params.query,
    id: params.publication_id,
    content: "publication",
    mfd: params.domain || "0000",
    page: String(params.page || 1),
  });

  const $ = cheerio.load(html);

  // Publication metadata
  const publication: DeepSearchPublication = {
    title: $("h5.card-title.fw-semibold").first().text().trim(),
    publisher: $("p.card-text.text-body-secondary").first().text().trim(),
    cover_url: $("img.foreground").attr("src") || "",
    publication_url: $('a.btn-info[href*="bps.go.id/publication"]').attr("href") || "",
    pdf_download_base: "",
  };

  // PDF download base from inline script
  $("script").each((_, el) => {
    const content = $(el).html() || "";
    const m = content.match(/https:\/\/web-api\.bps\.go\.id\/download\.php\?f=[^#"]*/);
    if (m) publication.pdf_download_base = m[0];
  });

  // Total matches: "Menampilkan 11 halaman dengan kata kunci "akses internet""
  const totalMatch = $("body").text().match(/Menampilkan\s+(\d+)\s+halaman dengan kata kunci/);
  const total_matches = totalMatch ? parseInt(totalMatch[1]) : 0;

  // Pagination
  const pages: number[] = [];
  $("a[onclick*='changePage']").each((_, el) => {
    const m = $(el).attr("onclick")?.match(/changePage\((\d+)\)/);
    if (m) pages.push(parseInt(m[1]));
  });
  const total_pages = pages.length > 0 ? Math.max(...pages) : 1;

  // Matches
  const matches: DeepSearchMatch[] = [];
  $("div.card-result").each((_, el) => {
    const $c = $(el);
    const page_number = parseInt($c.find("a.linkhalaman").attr("data-page") || "0");
    const excerptEl = $c.find('p[id^="deskripsi-"]');
    const excerpt = cleanExcerpt(excerptEl.text());

    const highlights: string[] = [];
    excerptEl.find("mark").each((_, mark) => {
      const kw = $(mark).text().trim().toLowerCase();
      if (!highlights.includes(kw)) highlights.push(kw);
    });

    const pdf_viewer_url = publication.pdf_download_base
      ? `${publication.pdf_download_base}#page=${page_number}`
      : "";

    matches.push({ page_number, excerpt, highlights, pdf_viewer_url });
  });

  return {
    query: $("input#q").val()?.toString() || params.query,
    publication,
    total_matches,
    current_page: params.page || 1,
    total_pages,
    matches,
  };
}
```

---

## 6. Workflow Examples

### Workflow 1: Discovery → Deep Search

```
User: "Find internet access data in Indonesia"

Step 1 → allstats_search({ query: "akses internet", content: "publication" })
  Results:
    [0] Statistik Telekomunikasi Indonesia 2022
        deep_search_id: "131385d0253c6aae7c7a59fa"

Step 2 → allstats_deep_search({
    query: "akses internet",
    publication_id: "131385d0253c6aae7c7a59fa"
  })
  Matches:
    - Page 74: "Internet access ownership highest in DKI Jakarta 95.39%"
    - Page 63: "66.48% of population aged 5+ have accessed the internet"
```

### Workflow 2: WebAPI Fallback

```
User: "Find poverty data for Papua 2024"

Step 1 → WebAPI: list/model/data (domain=9100, keyword=poverty)
  Result: empty or limited

Step 2 → allstats_search({ query: "kemiskinan Papua", domain: "9100", year_from: "2024" })
  Result: publications, tables, BRS about Papua poverty
```

### Workflow 3: Parallel Enrichment

```
User: "Latest inflation data"

Parallel:
  A → WebAPI: list/model/data/var/1709 (CPI data, structured JSON)
  B → allstats_search({ query: "inflasi", content: "pressrelease", sort: "terbaru" })

Response combines:
  - Structured data from WebAPI (actual numbers)
  - Latest BRS press release links from AllStats
```

---

## 7. Comparison: WebAPI vs AllStats

| Aspect | BPS WebAPI | AllStats Search |
|--------|-----------|-----------------|
| Base URL | `webapi.bps.go.id` | `searchengine.web.bps.go.id` |
| Format | JSON | HTML (parsing) |
| Auth | API Key | User-Agent only |
| Full-text PDF | ❌ | ✅ Deep Search |
| Structured data | ✅ | ❌ |
| Export/Import | ✅ | ❌ |
| Census | ✅ | ❌ |
| SIMDASI | ✅ | ❌ |
| Unified search | ❌ | ✅ |
| Speed | ✅ Fast | ⚠️ Slower |
| Stability | ✅ Official | ⚠️ Scraping |

---

## 8. Best Practices

### Rate Limiting & Caching
- Delay ~500ms-1s between requests
- Cache publication metadata and deep search results (rarely change)
- Avoid excessive parallel requests to AllStats

### Error Handling
```typescript
async function fetchWithRetry(url: string, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (res.ok) return res.text();
      if (res.status === 403 && i < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("Max retries");
}
```

### Dependency
```json
{ "dependencies": { "cheerio": "^1.0.0" } }
```

### Cloudflare Workers Compatibility
- `fetch` with custom User-Agent ✅ works from CF Workers
- `cheerio` ✅ works in CF Workers runtime
- If BPS tightens security → graceful degradation to WebAPI-only mode
