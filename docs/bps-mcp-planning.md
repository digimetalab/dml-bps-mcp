# BPS Statistics MCP Server — Project Plan

> **Project:** `dml-bps-mcp`
> **License:** MIT (open source)
> **Status:** Planning
> **Author:** Murphi
> **Date:** 2026-03-30

---

## 1. Executive Summary

An MCP (Model Context Protocol) server that bridges BPS (Statistics Indonesia) data to AI clients such as Claude Desktop, Claude Code, Cursor, and other MCP-compatible clients. This server allows users to perform natural language queries on official Indonesian statistical data — ranging from population, economic, trade, to census data.

**Key principles:**
- Open source, free, compliant with BPS API ToU (non-commercial)
- Bring-your-own-key (BYOK) — each user uses their own BPS API token
- Auth-layer agnostic — ready to migrate from simple token (v1) to WSO2 OAuth (v2)
- Dual transport — stdio (local via npx) + Streamable HTTP (remote via Cloudflare Workers)
- Bilingual — supports Indonesian and English output
- Human-readable output — raw BPS data transformed into LLM-friendly format

**Compatible AI Clients:**
- **Local (stdio):** Claude Desktop, Claude Code, Cursor, VS Code + Copilot, Windsurf, Cline/Roo Code, Zed, Continue.dev
- **Remote (HTTP):** ChatGPT, Gemini, Microsoft Copilot, custom web/mobile apps, n8n, automation platforms

---

## 2. Arsitektur

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Clients                               │
│                                                                   │
│  LOCAL (stdio)                    REMOTE (Streamable HTTP)        │
│  ┌──────────────────────┐        ┌───────────────────────────┐   │
│  │ Claude Desktop       │        │ ChatGPT (Connectors)      │   │
│  │ Claude Code          │        │ Gemini                    │   │
│  │ Cursor / VS Code     │        │ Microsoft Copilot         │   │
│  │ Windsurf / Zed       │        │ Custom web/mobile apps    │   │
│  │ Cline / Roo Code     │        │ n8n / automation tools    │   │
│  └──────────┬───────────┘        └─────────────┬─────────────┘   │
│             │                                   │                 │
└─────────────┼───────────────────────────────────┼─────────────────┘
              │ stdin/stdout                       │ HTTPS POST/GET
              ▼                                   ▼
┌─────────────────────────┐   ┌───────────────────────────────────┐
│  npm package (stdio)    │   │  Cloudflare Workers (HTTP)        │
│  npx dml-bps-mcp     │   │  dml-bps-mcp.{user}.workers.dev/mcp  │
│                         │   │                                   │
│  Runs as local          │   │  Runs on Cloudflare edge          │
│  subprocess on user's   │   │  300+ global locations             │
│  machine                │   │  Scale to zero, pay per request   │
└────────────┬────────────┘   └──────────────┬────────────────────┘
             │                                │
             └────────────┬───────────────────┘
                          ▼
        ┌──────────────────────────────────────┐
        │        Shared Core Logic              │
        │                                       │
        │  ┌───────────┐ ┌───────────┐ ┌─────┐│
        │  │  Tools    │ │ Resources │ │Prmpt││
        │  │  Layer    │ │  Layer    │ │Layer ││
        │  └─────┬─────┘ └─────┬─────┘ └─────┘│
        │        │              │               │
        │  ┌─────▼──────────────▼────────────┐ │
        │  │       Core Services              │ │
        │  │ Domain Resolver │ Data Formatter │ │
        │  │ Response Cache  │ Attribution    │ │
        │  └─────────────────┬───────────────┘ │
        │                    │                  │
        │  ┌─────────────────▼───────────────┐ │
        │  │  Auth Provider (Strategy)        │ │
        │  │  V1: API Key │ V2: WSO2 OAuth2  │ │
        │  └─────────────────┬───────────────┘ │
        │                    │                  │
        │  ┌─────────────────▼───────────────┐ │
        │  │  HTTP Client (fetch)             │ │
        │  └─────────────────┬───────────────┘ │
        └────────────────────┼─────────────────┘
                             │ HTTPS
                             ▼
                ┌────────────────────────┐
                │   webapi.bps.go.id    │
                │   BPS Web API v1      │
                └────────────────────────┘
```

### 2.2 Transport Layer — Dual Mode

The MCP protocol supports two standard transports. This server implements both with shared core logic.

```
┌─────────────────────────────────────────────────────────┐
│                   Transport Layer                        │
│                                                          │
│  ┌─────────────────────────┐  ┌────────────────────────┐│
│  │  stdio Transport        │  │  Streamable HTTP       ││
│  │  (StdioServerTransport) │  │  (Cloudflare Workers)  ││
│  │                         │  │                        ││
│  │  • npx dml-bps-mcp   │  │  • POST /mcp           ││
│  │  • JSON-RPC via stdin/  │  │  • GET /mcp (SSE)      ││
│  │    stdout               │  │  • Durable Objects for ││
│  │  • Zero network latency │  │    session state       ││
│  │  • User's env vars      │  │  • KV for caching      ││
│  │    provide BPS API key  │  │  • API key via header   ││
│  │                         │  │    or OAuth flow       ││
│  └─────────────────────────┘  └────────────────────────┘│
│                                                          │
│  Shared: McpServer instance + all tool/resource handlers │
└─────────────────────────────────────────────────────────┘
```

**When to use which?**

| Scenario | Transport | Reason |
|---|---|---|
| Developer using Claude Desktop/Code | stdio | Simplest, install via npx |
| Developer using Cursor/VS Code | stdio | Native support, low latency |
| User using ChatGPT | HTTP (Workers) | ChatGPT needs remote HTTPS endpoint |
| User using Gemini | HTTP (Workers) | Same — needs remote endpoint |
| Mobile app / web app | HTTP (Workers) | Cannot spawn subprocess |
| Automation (n8n, etc.) | HTTP (Workers) | Needs network accessibility |
| Air-gapped / offline | stdio | No internet needed for transport |

### 2.2 Auth Provider — Strategy Pattern (v1 ↔ v2 Migration)

This is the key design to handle migration from simple token to WSO2.

```
┌────────────────────────────────────────────┐
│           IAuthProvider (interface)          │
│                                             │
│  + authenticate(): Promise<AuthResult>      │
│  + getHeaders(): Promise<Record<string,str>>│
│  + isExpired(): boolean                     │
│  + refresh(): Promise<void>                 │
│  + getType(): "api-key" | "oauth2"          │
└────────────┬────────────────┬──────────────┘
             │                │
   ┌─────────▼──────┐  ┌─────▼────────────┐
   │ ApiKeyProvider  │  │ WSO2OAuthProvider │
   │ (BPS API v1)   │  │ (BPS API v2)      │
   │                 │  │                   │
   │ - apiKey: str   │  │ - clientId: str   │
   │                 │  │ - clientSecret: st│
   │ getHeaders() →  │  │ - tokenEndpoint   │
   │ { key: apiKey } │  │ - accessToken     │
   │                 │  │ - refreshToken    │
   │ isExpired() →   │  │ - expiresAt       │
   │ false (never)   │  │                   │
   │                 │  │ getHeaders() →    │
   │                 │  │ { Authorization:  │
   │                 │  │   Bearer <token> }│
   └─────────────────┘  └──────────────────┘
```

**Configuration via environment:**

```bash
# V1 (current) — just API key
BPS_AUTH_TYPE=api-key
BPS_API_KEY=your_api_key_here

# V2 (future) — WSO2 OAuth2
BPS_AUTH_TYPE=oauth2
BPS_OAUTH_CLIENT_ID=your_client_id
BPS_OAUTH_CLIENT_SECRET=your_client_secret
BPS_OAUTH_TOKEN_ENDPOINT=https://api-gateway.bps.go.id/oauth2/token
BPS_OAUTH_SCOPES=openid,statistics:read

# Shared
BPS_API_BASE_URL=https://webapi.bps.go.id/v1  # or v2 later
BPS_DEFAULT_LANG=ind
```

**Auto-detection:** The server can auto-detect the auth type from available env vars, so users don't need to explicitly set `BPS_AUTH_TYPE` if only `BPS_API_KEY` is set.

### 2.3 Caching Strategy

BPS data rarely changes (monthly/yearly releases), so caching is very effective:

```
┌─────────────────────────────────────────────┐
│               Cache Layer                    │
│                                              │
│  Strategy: In-memory LRU + TTL-based         │
│                                              │
│  ┌─────────────────────────────────────┐    │
│  │  Domain list     │ TTL: 24 hours    │    │
│  │  Subject list    │ TTL: 24 hours    │    │
│  │  Variable list   │ TTL: 12 hours    │    │
│  │  Static tables   │ TTL: 6 hours     │    │
│  │  Dynamic data    │ TTL: 1 hour      │    │
│  │  Trade data      │ TTL: 1 hour      │    │
│  │  Press release   │ TTL: 30 minutes  │    │
│  │  Publications    │ TTL: 6 hours     │    │
│  │  Strategic ind.  │ TTL: 1 hour      │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  Cache key format:                           │
│  {endpoint}:{domain}:{params_hash}           │
│                                              │
│  Invalidation:                               │
│  - TTL-based automatic expiry                │
│  - Manual flush via `cache_clear` tool       │
│  - Max entries: configurable (default 500)   │
└─────────────────────────────────────────────┘
```

---

## 3. MCP Tools — Complete Specification

### 3.1 Tool Catalog

Based on a complete analysis of the BPS API documentation, here are all the tools that will be exposed:

#### Category: Region (Domain)

| Tool | Description | Key Params |
|------|-------------|------------|
| `list_domains` | List BPS domains/regions (province, regency/city) | `type`: all/prov/kab/kabbyprov, `prov?` |

#### Category: Subject & Variable

| Tool | Description | Key Params |
|------|-------------|------------|
| `list_subjects` | List statistical data subjects | `domain`, `subcat?` |
| `list_subject_categories` | List subject categories | `domain` |
| `list_variables` | List variables in dynamic tables | `domain`, `subject?`, `year?` |
| `list_vertical_variables` | List vertical variables | `domain`, `var?` |
| `list_derived_variables` | List derived variables | `domain`, `var?` |
| `list_periods` | List data periods | `domain`, `var?` |
| `list_derived_periods` | List derived periods | `domain`, `var?` |
| `list_units` | List data units | `domain` |

#### Category: Dynamic Data

| Tool | Description | Key Params |
|------|-------------|------------|
| `get_dynamic_data` | **Core tool** — Fetch data from dynamic tables | `domain`, `var`, `th` (period), `turvar?`, `vervar?`, `turth?` |

#### Category: Static Tables

| Tool | Description | Key Params |
|------|-------------|------------|
| `list_static_tables` | List all static tables | `domain`, `keyword?`, `year?`, `month?` |
| `get_static_table` | Detail of one static table (HTML table) | `domain`, `id` |

#### Category: Census

| Tool | Description | Key Params |
|------|-------------|------------|
| `list_census_events` | List census events | — |
| `list_census_topics` | List data topics per census | `kegiatan` |
| `list_census_areas` | List census regions | `kegiatan` |
| `list_census_datasets` | List datasets per census & topic | `kegiatan`, `topik` |
| `get_census_data` | Fetch census data | `kegiatan`, `wilayah_sensus`, `dataset` |

#### Category: SIMDASI (Statistics Indonesia / DDA)

| Tool | Description | Key Params |
|------|-------------|------------|
| `list_simdasi_subjects` | SIMDASI subjects per region | `wilayah` (7-digit MFD code) |
| `list_simdasi_tables` | SIMDASI tables per region | `wilayah` |
| `list_simdasi_tables_by_subject` | Tables per region & subject | `wilayah`, `id_subjek` |
| `get_simdasi_table` | SIMDASI table detail | `wilayah`, `tahun`, `id_tabel` |
| `list_simdasi_provinces` | Province MFD codes | — |
| `list_simdasi_regencies` | Regency/city MFD codes | `parent` |
| `list_simdasi_districts` | District MFD codes | `parent` |

#### Category: CSA (Classification of Statistical Activities)

| Tool | Description | Key Params |
|------|-------------|------------|
| `list_csa_categories` | CSA categories | `domain` |
| `list_csa_subjects` | CSA subjects | `domain`, `subcat?` |
| `list_csa_tables` | Tables per CSA subject | `domain`, `subject?` |
| `get_csa_table` | CSA table detail | `domain`, `id`, `year?` |

#### Category: Publications & News

| Tool | Description | Key Params |
|------|-------------|------------|
| `list_publications` | List BPS publications | `domain`, `keyword?`, `year?`, `month?` |
| `get_publication` | Publication detail | `domain`, `id` |
| `list_press_releases` | List Official Statistics News (BRS) | `domain`, `keyword?`, `year?`, `month?` |
| `get_press_release` | BRS detail | `domain`, `id` |

#### Category: Indicators & References

| Tool | Description | Key Params |
|------|-------------|------------|
| `list_strategic_indicators` | Strategic indicators (national/province) | `domain`, `var?` |
| `list_infographics` | BPS infographics | `domain`, `keyword?` |
| `list_glossary` | Statistical glossary | `prefix?`, `perpage?` |
| `get_glossary` | Glossary detail | `id` |

#### Category: Foreign Trade

| Tool | Description | Key Params |
|------|-------------|------------|
| `get_trade_data` | Export/import data | `source` (1=export/2=import), `hs_code`, `hs_type`, `year`, `period` |

#### Category: SDGs & SDDS

| Tool | Description | Key Params |
|------|-------------|------------|
| `get_sdgs_data` | Sustainable Development Goals data | (TBD — need to explore endpoint) |
| `get_sdds_data` | SDDS data | (TBD — need to explore endpoint) |

#### Category: Search & Utilities

| Tool | Description | Key Params |
|------|-------------|------------|
| `search` | Cross-type data search | `domain`, `keyword`, `type?` |
| `resolve_domain` | Convert region name → domain code | `query` (e.g., "Surabaya", "Jawa Timur") |
| `cache_clear` | Clear cache | — |

### 3.2 Domain Resolver — Smart Lookup

This is a critical feature that makes the server user-friendly. Users say "Surabaya", the server needs to resolve it to domain code "3578".

```
Strategi:
1. Saat startup / first call → fetch full domain list → cache 24 jam
2. Build inverted index: lowercase name → domain_id
3. Support fuzzy matching (Levenshtein distance)
4. Support common aliases:
   - "Jakarta" → "3100" (DKI Jakarta)
   - "Jogja" / "Yogya" → "3400" (DI Yogyakarta)
   - "Jatim" → "3500" (Jawa Timur)
   - dsb.

Internal tool — dipanggil oleh tools lain, bukan directly exposed.
Tapi juga available as tool untuk debugging/exploration.
```

### 3.3 Data Formatter

The BPS API returns data in a format that is difficult for LLMs to read, especially `datacontent` in dynamic data:

```json
// Raw BPS response (datacontent key = gabungan vervar+var+turvar+th)
{ "99991452891000": 83.68 }

// Perlu di-transform menjadi:
"Persentase Rumah Tangga yang menggunakan Listrik PLN
di INDONESIA pada tahun 2000: 83.68%"
```

The formatter will:
1. Resolve datacontent keys to readable labels
2. Form text tables or structured responses
3. Include metadata (source, notes, unit)
4. Add BPS attribution per ToU

---

## 4. MCP Resources

Resources provide static/reference data that clients can read without a tool call:

| Resource URI | Description |
|---|---|
| `bps://domains/provinces` | List of provinces (cached) |
| `bps://domains/regencies/{prov_id}` | Regencies/cities per province |
| `bps://subjects/{domain}` | List of subjects per domain |
| `bps://glossary/{term}` | Statistical term definitions |

---

## 5. MCP Prompts

Pre-built prompts for common use cases:

| Prompt Name | Description |
|---|---|
| `compare_regions` | Template for comparing data between regions |
| `trend_analysis` | Template for multi-year trend analysis |
| `poverty_profile` | Template for poverty profile of a region |
| `economic_overview` | Template for regional economic summary |
| `population_stats` | Template for population statistics |

---

## 6. Project Structure

```
dml-bps-mcp/
├── src/
│   ├── index.ts                    # Entry point: stdio transport (npm)
│   ├── worker.ts                   # Entry point: Cloudflare Workers (HTTP)
│   ├── server.ts                   # MCP server setup & tool registration (shared)
│   │
│   ├── transport/                  # Transport layer
│   │   ├── stdio.ts                # stdio transport init
│   │   └── http.ts                 # Streamable HTTP transport init
│   │
│   ├── auth/                       # Auth provider (strategy pattern)
│   │   ├── types.ts                # IAuthProvider interface
│   │   ├── api-key.provider.ts     # V1: simple API key
│   │   ├── oauth2.provider.ts      # V2: WSO2 OAuth2 (future)
│   │   └── factory.ts              # Auto-detect & instantiate provider
│   │
│   ├── client/                     # HTTP client abstraction
│   │   ├── bps-client.ts           # Main BPS API client
│   │   ├── types.ts                # API response types
│   │   └── endpoints.ts            # Endpoint URL builders
│   │
│   ├── tools/                      # MCP tool handlers
│   │   ├── domain.tools.ts         # list_domains, resolve_domain
│   │   ├── dynamic-data.tools.ts   # get_dynamic_data + support tools
│   │   ├── static-table.tools.ts   # list/get static tables
│   │   ├── census.tools.ts         # Census data tools
│   │   ├── simdasi.tools.ts        # SIMDASI tools
│   │   ├── csa.tools.ts            # CSA subject tools
│   │   ├── publication.tools.ts    # Publications & press releases
│   │   ├── trade.tools.ts          # Foreign trade data
│   │   ├── reference.tools.ts      # Indicators, infographics, glossary
│   │   ├── search.tools.ts         # Cross-type search
│   │   └── utility.tools.ts        # cache_clear, server info
│   │
│   ├── resources/                  # MCP resource handlers
│   │   └── domain.resources.ts
│   │
│   ├── prompts/                    # MCP prompt templates
│   │   └── analysis.prompts.ts
│   │
│   ├── services/                   # Core business logic
│   │   ├── domain-resolver.ts      # Name → code resolver with fuzzy match
│   │   ├── data-formatter.ts       # Raw BPS data → readable output
│   │   ├── cache.ts                # Cache interface (in-memory for stdio, KV for Workers)
│   │   └── attribution.ts          # ToU-compliant attribution text
│   │
│   ├── config/                     # Configuration
│   │   ├── index.ts                # Env var parsing with Zod validation
│   │   ├── defaults.ts             # Default values & constants
│   │   └── domain-aliases.ts       # Common name aliases for domains
│   │
│   └── utils/                      # Shared utilities
│       ├── logger.ts               # stderr logger (stdio-safe)
│       └── error.ts                # Error handling & user-friendly messages
│
├── worker/                         # Cloudflare Workers specific
│   ├── wrangler.toml               # Workers config (routes, KV bindings, DO)
│   └── worker-entry.ts             # Workers fetch handler wrapping server
│
├── tests/
│   ├── unit/
│   │   ├── auth/
│   │   ├── services/
│   │   └── tools/
│   ├── integration/
│   │   └── bps-api.test.ts         # Real API integration tests
│   └── fixtures/
│       └── *.json                  # Sample BPS API responses
│
├── docs/
│   ├── SETUP.md                    # Getting started guide
│   ├── TOOLS.md                    # Complete tool reference
│   ├── CLIENTS.md                  # Per-client connection guide
│   ├── DEPLOY-WORKERS.md           # Cloudflare Workers deployment guide
│   ├── MIGRATION-V2.md             # WSO2 migration guide
│   └── CONTRIBUTING.md
│
├── scripts/
│   ├── fetch-domains.ts            # Script to pre-cache domain list
│   └── generate-aliases.ts         # Generate domain alias map
│
├── .env.example
├── package.json
├── tsconfig.json
├── wrangler.toml                   # Root wrangler config (symlink or main)
├── README.md
├── LICENSE                         # MIT
└── CHANGELOG.md
```

---

## 7. Tech Stack

| Component | Choice | Rationale |
|---|---|---|
| Runtime (stdio) | Node.js ≥ 18 | MCP SDK requirement |
| Runtime (remote) | Cloudflare Workers | Edge deployment, free tier, global |
| Language | TypeScript 5.x | Type safety, IDE support |
| MCP SDK | `@modelcontextprotocol/sdk` | Official SDK |
| Schema validation | `zod` v3 | Required peer dep of MCP SDK |
| HTTP client | Built-in `fetch` | Works on both Node.js 18+ and Workers |
| Caching (stdio) | Custom in-memory LRU + TTL | Zero dependencies |
| Caching (Workers) | Cloudflare KV | Persistent, global, edge-cached |
| Session (Workers) | Cloudflare Durable Objects | Per-connection state |
| Auth (Workers) | `workers-oauth-provider` | Cloudflare's OAuth library for MCP |
| Testing | `vitest` | Fast, TypeScript native |
| Build (stdio) | `tsc` | Simple, reliable |
| Build (Workers) | `wrangler` | Cloudflare's CLI tool |
| Linting | `eslint` + `prettier` | Code quality |
| Package manager | `npm` | Widest compatibility |

**Shared-core philosophy:** Tools, auth providers, formatters, and resolvers are written once — the transport layer (stdio vs Workers) only differs in entry points and cache implementation. The `fetch` API is available on both runtimes without polyfill.

---

## 8. Configuration & Environment

### 8.1 Environment Variables

```bash
# === Required ===
BPS_API_KEY=your_api_key          # From webapi.bps.go.id

# === Optional (with defaults) ===
BPS_API_BASE_URL=https://webapi.bps.go.id/v1  # Base API URL
BPS_DEFAULT_LANG=ind              # Default language: ind | eng
BPS_DEFAULT_DOMAIN=0000           # Default domain (0000 = National)
BPS_CACHE_ENABLED=true            # Enable/disable caching
BPS_CACHE_MAX_ENTRIES=500         # Max cache entries (stdio in-memory only)
BPS_LOG_LEVEL=info                # debug | info | warn | error

# === Transport ===
BPS_TRANSPORT=stdio               # stdio | http
BPS_HTTP_PORT=3000                # Port for local HTTP mode (non-Workers)

# === Future: WSO2 OAuth2 (v2) ===
# BPS_AUTH_TYPE=oauth2
# BPS_OAUTH_CLIENT_ID=
# BPS_OAUTH_CLIENT_SECRET=
# BPS_OAUTH_TOKEN_ENDPOINT=
# BPS_OAUTH_SCOPES=
# BPS_OAUTH_REFRESH_BUFFER_SECONDS=60
```

### 8.2 Cloudflare Workers Config (wrangler.toml)

```toml
name = "dml-bps-mcp"
main = "src/worker.ts"
compatibility_date = "2025-12-01"

[vars]
BPS_API_BASE_URL = "https://webapi.bps.go.id/v1"
BPS_DEFAULT_LANG = "ind"
BPS_DEFAULT_DOMAIN = "0000"

# KV namespace for caching BPS API responses
[[kv_namespaces]]
binding = "BPS_CACHE"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Durable Objects for session state (optional, for OAuth flow)
[durable_objects]
bindings = [
  { name = "MCP_SESSION", class_name = "McpSession" }
]

[[migrations]]
tag = "v1"
new_classes = ["McpSession"]
```

**Note:** On Cloudflare Workers, BPS_API_KEY is NOT stored in `[vars]` (plain text). Use `wrangler secret put BPS_API_KEY` to store it as an encrypted secret. However, in authless public deployments, users send their own API key via the `X-BPS-API-Key` request header.

### 8.2 Zod Config Schema

```typescript
import { z } from "zod";

const ConfigSchema = z.object({
  // Auth
  authType: z.enum(["api-key", "oauth2"]).default("api-key"),
  apiKey: z.string().optional(),
  oauthClientId: z.string().optional(),
  oauthClientSecret: z.string().optional(),
  oauthTokenEndpoint: z.string().url().optional(),
  oauthScopes: z.string().optional(),

  // API
  apiBaseUrl: z.string().url().default("https://webapi.bps.go.id/v1"),
  defaultLang: z.enum(["ind", "eng"]).default("ind"),
  defaultDomain: z.string().default("0000"),

  // Cache
  cacheEnabled: z.boolean().default(true),
  cacheMaxEntries: z.number().int().positive().default(500),

  // Logging
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
}).refine(
  (data) => {
    if (data.authType === "api-key") return !!data.apiKey;
    if (data.authType === "oauth2") {
      return !!data.oauthClientId && !!data.oauthClientSecret && !!data.oauthTokenEndpoint;
    }
    return false;
  },
  { message: "Invalid auth configuration. Provide BPS_API_KEY or OAuth2 credentials." }
);
```

---

## 9. ToU Compliance Checklist

Based on the BPS API Terms of Use (December 2022):

| Article | Requirement | Implementation |
|---|---|---|
| 3B | Token cannot be shared | BYOK — user provides own key via env (stdio) or header (HTTP) |
| 4B | Attribution required | Every response includes: "Layanan ini menggunakan API Badan Pusat Statistik (BPS)" |
| 4C | Rate limit respect | Caching (in-memory / KV) + exponential backoff |
| 4E | Non-commercial | Open source MIT, free |
| 7 | Free & open for non-commercial | Compliant — no monetization |
| 14A | Token security | stdio: token in env var. Workers: token via encrypted header, not logged, not persisted |

### Attribution Text (required in every tool response)

```typescript
const ATTRIBUTION = "Sumber: Badan Pusat Statistik (BPS) — https://www.bps.go.id\n" +
  "Layanan ini menggunakan API Badan Pusat Statistik (BPS).";
```

### Remote Deployment & ToU Considerations

In remote mode (Cloudflare Workers), there are additional considerations regarding Article 3B (token cannot be shared):

**Option A: Authless — User sends key per-request (MVP)**
- User sets `X-BPS-API-Key` header on each connection
- Server does NOT store the key permanently
- Key only exists in memory during request processing
- Compliant because the server does not "lend" the key — users use their own key

**Option B: OAuth flow — User logs in & stores key (Phase 4+)**
- User authenticates via OAuth (GitHub/Google)
- User enters BPS API key once, stored encrypted in per-user Durable Object
- Subsequent requests use stored key
- More convenient, but needs clear user consent

**Option C: Self-hosted — User deploys their own Workers (recommended for production)**
- User forks repo → `wrangler secret put BPS_API_KEY` → deploys to their own Workers account
- Most secure — key never transits to third-party servers
- Template `Deploy to Cloudflare` button in README

---

## 10. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Goal:** Server running with 3-5 core tools.

- [ ] Project scaffolding (TypeScript, MCP SDK, Zod)
- [ ] Config management with Zod validation
- [ ] Auth provider interface + API Key provider (v1)
- [ ] BPS HTTP client with error handling
- [ ] In-memory LRU cache with TTL
- [ ] stderr-safe logger
- [ ] **Tools:** `list_domains`, `resolve_domain`
- [ ] **Tools:** `list_subjects`, `list_variables`
- [ ] **Tools:** `get_dynamic_data` (core tool)
- [ ] Data formatter — datacontent key resolution
- [ ] Attribution text injection
- [ ] Basic README + setup guide
- [ ] Test: connect to Claude Desktop via stdio

### Phase 2: Complete Data Coverage (Week 3-4)

**Goal:** All BPS API endpoints covered.

- [ ] **Tools:** Static tables (list + detail)
- [ ] **Tools:** Census data (events, topics, areas, datasets, data)
- [ ] **Tools:** SIMDASI (subjects, tables, detail, MFD codes)
- [ ] **Tools:** CSA subject hierarchy + tables
- [ ] **Tools:** Publications & press releases
- [ ] **Tools:** Strategic indicators
- [ ] **Tools:** Trade data (export/import)
- [ ] **Tools:** Infographics, glossary
- [ ] **Tools:** Cross-type search
- [ ] **Tools:** `cache_clear` utility
- [ ] Domain alias map (Jogja → 3400, Jatim → 3500, etc.)
- [ ] Auto-pagination (fetching all pages transparently)

### Phase 3: Polish & DX (Week 5-6)

**Goal:** Production-ready stdio version, well-documented, publishable.

- [ ] MCP Resources (domain lists, subject catalogs)
- [ ] MCP Prompts (compare_regions, trend_analysis, etc.)
- [ ] Comprehensive unit tests (vitest)
- [ ] Integration tests against real BPS API
- [ ] Error messages in Indonesian
- [ ] `.env.example` + setup wizard script
- [ ] Full documentation: SETUP.md, TOOLS.md, CLIENTS.md, CONTRIBUTING.md
- [ ] Per-client config examples (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf)
- [ ] GitHub Actions CI/CD
- [ ] Publish to npm: `dml-bps-mcp`
- [ ] Submit to MCP server registry (modelcontextprotocol/servers)

### Phase 4: Cloudflare Workers Remote Deployment (Week 7-8)

**Goal:** BPS MCP accessible via HTTP for ChatGPT, Gemini, and all remote clients.

- [ ] Cloudflare Workers entry point (`src/worker.ts`)
- [ ] Streamable HTTP transport setup with `agents` SDK
- [ ] Cache interface abstraction (in-memory ↔ KV switch)
- [ ] KV namespace setup for caching BPS responses
- [ ] API key via `X-BPS-API-Key` header (authless mode)
- [ ] CORS + security headers
- [ ] Rate limiting per-IP at Workers level
- [ ] `wrangler.toml` configuration
- [ ] "Deploy to Cloudflare" button in README
- [ ] Self-hosted deployment guide (DEPLOY-WORKERS.md)
- [ ] Test: connect from ChatGPT Connectors
- [ ] Test: connect from Gemini
- [ ] Test: connect from MCP Inspector
- [ ] Submit to Smithery.ai (MCP marketplace)
- [ ] Submit to PulseMCP.com client directory

### Phase 5: WSO2 Readiness & OAuth (Week 9-10)

**Goal:** Ready for BPS API v2 auth migration + optional OAuth for remote users.

- [ ] OAuth2 provider implementation (WSO2-compatible)
- [ ] Token refresh logic + retry on 401
- [ ] MIGRATION-V2.md documentation
- [ ] Optional: OAuth flow for remote users (Cloudflare Access or GitHub OAuth)
- [ ] Optional: Durable Objects for per-user API key storage
- [ ] Docker image (alternative deployment for non-CF users)

---

## 11. WSO2 Migration Strategy

### 11.1 What Changes?

| Aspect | V1 (Current) | V2 (WSO2) |
|---|---|---|
| Auth mechanism | Static API key as query param | OAuth2 Bearer token in header |
| Token lifecycle | Permanent, no expiry | Access token + refresh token, expiry |
| Registration | webapi.bps.go.id → get key | WSO2 Developer Portal → OAuth app |
| Rate limiting | Implicit (server-side) | Explicit via API Gateway policies |
| Base URL | webapi.bps.go.id/v1 | May change (TBD) |
| API structure | May be same, may be v2 endpoints | TBD |

### 11.2 Design Already Future-Proof

1. **Auth abstracted** — Strategy pattern, switch via config
2. **Base URL configurable** — env var, not hardcoded
3. **HTTP client abstracted** — auth headers injected by provider, not in the client
4. **Token refresh built-in** — OAuth2 provider has refresh logic + buffer
5. **Retry on 401** — Client automatically refreshes token and retries on 401

### 11.3 Migration Checklist (When V2 Releases)

```
1. [ ] Analyze WSO2 BPS API docs
2. [ ] Implement OAuth2Provider based on actual endpoint
3. [ ] Test token acquisition + refresh flow
4. [ ] Map old → new endpoints (if they change)
5. [ ] Update README + config docs
6. [ ] Bump version (semver major if breaking)
7. [ ] Publish update
```

---

## 12. Usage Examples — Per-Client Connection Guide

### 12.1 Local Clients (stdio transport)

#### Claude Desktop

File: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "dml-bps-mcp": {
      "command": "npx",
      "args": ["-y", "dml-bps-mcp"],
      "env": {
        "BPS_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

#### Claude Code

File: `.mcp.json` in project root

```json
{
  "mcpServers": {
    "bps": {
      "command": "npx",
      "args": ["-y", "dml-bps-mcp"],
      "env": {
        "BPS_API_KEY": "${BPS_API_KEY}"
      }
    }
  }
}
```

Or via CLI: `claude mcp add bps -- npx -y dml-bps-mcp`

#### Cursor

Settings → Features → MCP → Add MCP Server:
- Type: `command`
- Command: `npx -y dml-bps-mcp`

Or file `~/.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "dml-bps-mcp": {
      "command": "npx",
      "args": ["-y", "dml-bps-mcp"],
      "env": {
        "BPS_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

#### VS Code + GitHub Copilot

File: `.vscode/mcp.json` in workspace:
```json
{
  "servers": {
    "dml-bps-mcp": {
      "command": "npx",
      "args": ["-y", "dml-bps-mcp"],
      "env": {
        "BPS_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

#### Windsurf / Cline / Roo Code

Same as Cursor format — add to their respective MCP config.

### 12.2 Remote Clients (Streamable HTTP transport)

#### Self-Hosted Workers (recommended)

```bash
# Clone & deploy to your own Cloudflare account
git clone https://github.com/Digimetalab/dml-bps-mcp
cd dml-bps-mcp
wrangler secret put BPS_API_KEY  # input key interactively
wrangler deploy
# → https://dml-bps-mcp.{your-subdomain}.workers.dev/mcp
```

#### ChatGPT

1. Enable Developer mode in ChatGPT Settings
2. Settings → Connectors → Create Connector
3. URL: `https://dml-bps-mcp.{your-subdomain}.workers.dev/mcp`
4. (Optional) add `X-BPS-API-Key` header if using public instance

#### Gemini / Microsoft Copilot

Point to the deployed Workers MCP endpoint URL.

#### From MCP Clients Without Native Remote Support

Use `mcp-remote` as a bridge:
```json
{
  "mcpServers": {
    "bps-remote": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://dml-bps-mcp.{subdomain}.workers.dev/mcp"]
    }
  }
}
```

### 12.3 Natural Language Query Examples

```
User: "Berapa jumlah penduduk Indonesia tahun 2023?"
→ AI calls: resolve_domain("Indonesia") → "0000"
→ AI calls: search(domain="0000", keyword="jumlah penduduk")
→ AI calls: get_dynamic_data(domain="0000", var=..., th=...)
→ AI presents: formatted population data with attribution

User: "Bandingkan angka kemiskinan Jawa Timur vs Jawa Barat 2020-2023"
→ AI calls: resolve_domain("Jawa Timur") → "3500"
→ AI calls: resolve_domain("Jawa Barat") → "3200"
→ AI calls: get_dynamic_data for both regions + multiple years
→ AI presents: comparison table with trend analysis

User: "Cari BRS terbaru tentang inflasi"
→ AI calls: list_press_releases(domain="0000", keyword="inflasi")
→ AI presents: list of recent press releases about inflation

User: "Data ekspor kopi Indonesia tahun 2024"
→ AI calls: get_trade_data(source=1, hs_code="0901", ...)
→ AI presents: formatted export data for coffee
```

---

## 13. Quality & Testing

### 13.1 Test Strategy

| Layer | Approach | Coverage Target |
|---|---|---|
| Unit tests | Mock BPS API responses | Auth providers, formatters, cache, resolver |
| Integration tests | Real API calls (gated by env var) | Core tools with live data |
| Fixture tests | Snapshot response format | Ensure formatter output stability |
| E2E | Manual via Claude Desktop | Happy path for all tool categories |

### 13.2 CI/CD

```yaml
# GitHub Actions
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:unit

  integration:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - run: npm run test:integration
    env:
      BPS_API_KEY: ${{ secrets.BPS_API_KEY }}

  publish-npm:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: [test]
    runs-on: ubuntu-latest
    steps:
      - run: npm publish --access public
    env:
      NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  deploy-workers:
    if: github.ref == 'refs/heads/main'
    needs: [test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy
```

---

## 14. Distribution Channels

| Channel | URL/Location | Purpose | Transport |
|---|---|---|---|
| npm | `npmjs.com/package/dml-bps-mcp` | Primary: stdio local install | stdio |
| GitHub | `github.com/Digimetalab/dml-bps-mcp` | Source code + issues | — |
| Cloudflare Workers | `dml-bps-mcp.{user}.workers.dev/mcp` | Self-deploy remote instance | HTTP |
| "Deploy to CF" button | In README.md | One-click self-deploy to user's CF account | HTTP |
| MCP Registry | `github.com/modelcontextprotocol/servers` | Official MCP listing | — |
| Smithery | `smithery.ai` | MCP marketplace | — |
| PulseMCP | `pulsemcp.com` | MCP client/server directory | — |
| Docker Hub | (optional Phase 5) | Self-hosted non-CF deployment | HTTP |

---

## 15. Risiko & Mitigasi

| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| BPS API down / rate limited | Users can't fetch data | Medium | Caching (KV/in-memory) + graceful error messages |
| BPS API v2 breaking changes | Major refactor needed | Medium | Abstracted client + versioned endpoints |
| WSO2 auth flow different from expected | Auth provider needs rewrite | Low | Strategy pattern allows isolated changes |
| API key abuse (user shares key) | BPS blocks the key | Low | BYOK model — document best practices |
| BPS changes ToU | May restrict MCP usage | Low | Monitor ToU, maintain compliance |
| Low adoption | Wasted effort | Medium | Target niche (researchers, data journalists) + good docs |
| CF Workers free tier limits hit | 100K req/day exceeded | Low | User self-deploy to own CF account (no shared limit) |
| API key exposure via HTTP | Key intercepted in transit | Low | HTTPS only + recommend self-deploy option |
| Workers cold start latency | Slow first request | Low | KV cache warm-up + CF auto-scales |
| Durable Object costs | Unexpected billing for heavy OAuth usage | Low | OAuth flow is optional; default authless mode is stateless |

---

## 16. Success Metrics

| Metric | Target (6 months) |
|---|---|
| GitHub stars | 100+ |
| npm weekly downloads | 200+ |
| MCP registry listed | Yes |
| Tools coverage | 100% of BPS API v1 |
| Test coverage | >80% unit tests |
| WSO2 ready | Auth provider implemented |
| Contributors | 3+ external contributors |
| Workers deployments | 10+ self-deployed instances (via "Deploy to CF" button) |
| Client compatibility | Tested on 5+ MCP clients (Claude, ChatGPT, Cursor, etc.) |

---

## 17. Cloudflare Workers Deployment — Detail

### 17.1 Why Workers, Not Pages?

| | Cloudflare Pages | Cloudflare Workers |
|---|---|---|
| Purpose | Static sites + SSR frameworks | Serverless compute, API endpoints |
| MCP support | Not possible (no persistent connections) | First-class: Streamable HTTP + SSE |
| Persistent state | No | Durable Objects, KV, R2 |
| Custom HTTP handling | Limited | Full control via fetch handler |
| Pricing | Free for static | Free: 100K req/day, 10ms CPU/req |

### 17.2 Workers Architecture

```
┌──────────────────────────────────────────────────────┐
│  Cloudflare Workers Runtime                           │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │  fetch handler (worker-entry.ts)                 │ │
│  │                                                   │ │
│  │  POST /mcp  → Streamable HTTP transport          │ │
│  │  GET  /mcp  → SSE stream (optional)              │ │
│  │  GET  /     → Health check + server info         │ │
│  │                                                   │ │
│  │  Headers:                                         │ │
│  │  X-BPS-API-Key: user's BPS token (per-request)   │ │
│  │  Accept: application/json, text/event-stream     │ │
│  └─────────────────────┬───────────────────────────┘ │
│                        │                              │
│  ┌─────────────────────▼───────────────────────────┐ │
│  │  McpServer (shared core — same as stdio)         │ │
│  │  All tools, resources, prompts registered here   │ │
│  └─────────────────────┬───────────────────────────┘ │
│                        │                              │
│  ┌─────────────────────▼───────────────────────────┐ │
│  │  Bindings                                        │ │
│  │  ┌──────────┐ ┌────────────┐ ┌───────────────┐  │ │
│  │  │  KV      │ │ Durable    │ │ Secrets       │  │ │
│  │  │  (cache) │ │ Objects    │ │ (BPS_API_KEY  │  │ │
│  │  │          │ │ (sessions) │ │  for self-    │  │ │
│  │  │          │ │            │ │  deploy mode) │  │ │
│  │  └──────────┘ └────────────┘ └───────────────┘  │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 17.3 Cache Strategy: In-Memory vs KV

| Aspect | stdio (in-memory) | Workers (KV) |
|---|---|---|
| Persistence | Lost on restart | Persists across requests |
| Latency | ~0ms (same process) | ~1-5ms (edge cache hit) |
| Shared across requests | Yes (same process) | Yes (global KV store) |
| TTL support | Custom implementation | Built-in `expirationTtl` |
| Max size | Limited by memory | 25 MiB per value |
| Cost | Free | Free tier: 100K reads/day |

Cache interface:
```typescript
interface ICacheProvider {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// stdio: InMemoryCache implements ICacheProvider
// Workers: KVCache implements ICacheProvider (wraps env.BPS_CACHE)
```

### 17.4 Deployment Options

**Option A: One-click deploy (recommended for ChatGPT/Gemini users)**
- "Deploy to Cloudflare" button in README
- User clicks → forks repo → auto-deploys to their CF account
- User sets BPS_API_KEY as a secret via Wrangler
- Endpoint: `https://dml-dml-bps-mcp.{user}.workers.dev/mcp`

**Option B: Manual deploy (developers)**
```bash
git clone https://github.com/Digimetalab/dml-bps-mcp
cd dml-bps-mcp
npm install
wrangler secret put BPS_API_KEY
wrangler deploy
```

**Option C: Shared public instance (demo/testing only)**
- We host one public instance for demo/testing
- User sends key via `X-BPS-API-Key` header per request
- Rate limited, for trial only
- URL: `https://bps-mcp-demo.digimetalab.workers.dev/mcp`

### 17.5 Security Considerations for Remote

| Concern | Mitigation |
|---|---|
| API key in transit | HTTPS only (enforced by CF), key in header not URL |
| API key logging | Not logged in Workers (explicitly excluded from logs) |
| Abuse / DDoS | CF built-in DDoS protection + rate limiting |
| Unauthorized access | Authless: per-request key. OAuth: login required. |
| DNS rebinding | Origin header validation (MCP spec requirement) |
| CORS | Whitelist known MCP client origins |

---

## 18. Open Questions

1. **npm package name:** `dml-bps-mcp` — already decided.

2. **SDGs & SDDS endpoints:** BPS API documentation is not detailed on this. Needs manual exploration.

3. **Statistical Classifications endpoint:** Present in docs but the complete parameters are not yet clear.

4. **Searching endpoint:** Need to test response format, no sample response in docs yet.

5. **SIMDASI detail table response format:** Docs don't show a complete sample response.

6. **Rate limits:** BPS does not document specific rate limits. Need empirical testing and implement conservative defaults.

7. **Workers: shared vs self-deploy model?** Do we host a public instance or only provide a self-deploy template? Recommendation: both — public demo + self-deploy for production.

8. **Workers: `@cloudflare/agents` SDK vs raw MCP SDK?** Cloudflare has an Agents SDK that is more integrated with the Workers ecosystem, but adds vendor lock-in. Need to evaluate the trade-off.

9. **mcp-remote compatibility:** For clients that don't natively support Streamable HTTP, need to test `mcp-remote` bridge compatibility.

---

*Document version: 2.0 — Last updated: 2026-03-31*
*Changelog: v2.0 — Added dual transport (stdio + Streamable HTTP), Cloudflare Workers deployment, per-client connection guide, cache abstraction, remote ToU considerations.*
