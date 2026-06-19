# DML BPS MCP Server

[![CI](https://github.com/Digimetalab/dml-bps-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Digimetalab/dml-bps-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)

MCP (Model Context Protocol) server for BPS (Badan Pusat Statistik) Indonesia official statistics data — by **Digimetalab**. Enables AI clients like Claude Desktop, Claude Code, Cursor, and others to access official Indonesian statistical data through natural language.

## Features

- **39 tools** covering all BPS WebAPI v1 endpoints + AllStats Search + AI-friendly shortcuts
- **AI-friendly** — `find_data` tool with automatic intent detection (resolve region → detect intent → find variable → fetch data)
- **Intent Detection** — automatically detects: single value, comparison, trend, ranking, table/breakdown, publication
- **Stopwords-ISO** — automatic noise removal for 758 Indonesian + 1298 English words
- **Static Table Fallback** — `find_data` automatically falls back to static tables when dynamic data is unavailable (e.g., religion data)
- **Result Hints** — every response includes actionable follow-up tips
- **AllStats Search Integration** — unified search + full-text PDF search (no API key required)
- **Smart Fallback** — WebAPI search automatically falls back to AllStats if no results
- **3 MCP Resources** — domain list, regencies per province, subjects per domain
- **5 MCP Prompts** — ready-to-use data analysis templates
- **Domain Resolver** with fuzzy matching (type "Jatim" → Jawa Timur)
- **Data Formatter** that converts raw BPS data into readable format
- **Persistent Learning Store** — auto-learns variable mappings, survives restarts
- **In-memory Cache** with TTL per data type
- **Rate Limiting** — 60 req/min per API key (remote worker)
- **Bilingual** — error messages and responses support both Indonesian and English
- **Automatic BPS Attribution** in every response (per Terms of Use)
- **BYOK** (Bring Your Own Key) — each user must provide their own BPS API key

## Prerequisites

- Node.js ≥ 22
- BPS API key (free, register at [webapi.bps.go.id](https://webapi.bps.go.id))

## Quick Start

### Via npx (recommended)

```bash
BPS_API_KEY=your_key npx dml-bps-mcp
```

### Clone & Run

```bash
git clone https://github.com/Digimetalab/dml-bps-mcp
cd dml-bps-mcp
npm install
npm run build
BPS_API_KEY=your_key npm start
```

## Remote Access via Cloudflare Workers

The server is publicly available at:

```
https://dml-bps-mcp.digimetalab.workers.dev/mcp
```

### Using with Claude.ai

1. Open [claude.ai](https://claude.ai) → Settings → Integrations → Add custom connector
2. Enter:
   - **Name:** BPS Statistics
   - **URL:** `https://dml-bps-mcp.digimetalab.workers.dev/mcp`
3. Claude will open the authorization page
4. Enter your **BPS API key** (free from [webapi.bps.go.id](https://webapi.bps.go.id))
5. Click "Authorize" — done!

The server uses OAuth 2.1 per MCP spec. Your API key is securely stored server-side and never exposed to the client.

### Using with Other AI Clients (Remote MCP)

For AI clients supporting remote MCP with OAuth (ChatGPT, Cursor remote, etc.):

```
MCP Server URL: https://dml-bps-mcp.digimetalab.workers.dev/mcp
```

The client will automatically initiate the OAuth flow — users only need to enter their BPS API key when the authorization page appears.

### Using with Custom Headers (without OAuth)

For clients supporting custom headers (Claude Desktop, Cursor local):

```json
{
  "mcpServers": {
    "dml-bps-mcp": {
      "type": "http",
      "url": "https://dml-bps-mcp.digimetalab.workers.dev/mcp",
      "headers": {
        "X-BPS-API-Key": "your_api_key_here"
      }
    }
  }
}
```

### Self-hosted

Deploy as a serverless worker to your own Cloudflare account:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Digimetalab/dml-bps-mcp)

See the full guide at [docs/DEPLOY-WORKERS.md](docs/DEPLOY-WORKERS.md).

> **Note:** BPS WebAPI (`https://webapi.bps.go.id`) no longer blocks requests from Cloudflare Workers, so you can access it **directly** (no proxy needed). However, the **AllStats Search Engine** (`https://searchengine.web.bps.go.id`) is still blocked by Cloudflare bot challenges. If you use Cloudflare Workers and want AllStats Search/Deep Search features, use [bps-api-proxy](https://github.com/Digimetalab/bps-api-proxy) as a relay (deploy on a server with a residential IP) and set `BPS_ALLSTATS_BASE_URL` in `wrangler.toml` to the proxy URL.

## MCP Client Configuration

### Claude Desktop

File: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

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

### Claude Code

```bash
claude mcp add bps -- npx -y dml-bps-mcp
```

Or `.mcp.json` in your project root:

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

### Cursor / VS Code

File `~/.cursor/mcp.json` or `.vscode/mcp.json`:

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

## Tools (39)

### AI-Friendly Smart Tools (5)

| Tool | Description |
|------|-------------|
| `find_data` | **Recommended** — Search & fetch data in one step (resolve region + find variable + fetch data) |
| `find_variable` | Search BPS data variables by keyword |
| `compare_data` | Compare data between regions (2+ regions in a single call) |
| `get_trend` | Fetch time-series/multi-year trend data in one call |
| `get_ranking` | Rank provinces by indicator (top-N) |

> **For AI:** Use `find_data` for single-region data, `compare_data` for comparisons, `get_trend` for trends, `get_ranking` for rankings. If results are too vague, use `find_variable` then `get_dynamic_data`.

### WebAPI Tools (32)

| Tool | Description |
|------|-------------|
| `list_domains` | List BPS regions (provinces, regencies/cities) |
| `resolve_domain` | Convert region name → domain code (fuzzy matching) |
| `list_subjects` | List statistics subject categories |
| `list_subject_categories` | Subject categories |
| `list_variables` | List dynamic table variables |
| `list_vertical_variables` | Vertical variables (disaggregation) |
| `list_derived_variables` | Derived/aggregated variables |
| `list_periods` | Available data periods |
| `list_derived_periods` | Derived periods |
| `list_units` | Data measurement units |
| `get_dynamic_data` | **Core** — Fetch dynamic table data (requires var_id) |
| `list_static_tables` | List static tables |
| `get_static_table` | Get static table details (HTML) |
| `list_press_releases` | List official press releases (BRS) |
| `get_press_release` | Get press release details |
| `list_publications` | List publications |
| `get_publication` | Get publication details |
| `list_strategic_indicators` | Strategic indicators (latest headline data) |
| `get_trade_data` | Export/import data by HS code |
| `list_infographics` | List BPS infographics |
| `get_infographic` | Get infographic details |
| `list_news` | List BPS news |
| `get_news` | Get news details |
| `list_census_events` | List census activities |
| `list_census_topics` | Census topics per activity |
| `list_csa_categories` | CSA categories |
| `list_csa_subjects` | CSA subjects per domain |
| `list_csa_tables` | CSA tables per subject |
| `get_csa_table` | Get CSA table details (HTML) |
| `list_glossary` | Statistics glossary |
| `search` | Cross-type search (WebAPI + AllStats fallback) |
| `cache_clear` | Clear cache |

### AllStats Search Tools (2)

| Tool | Description |
|------|-------------|
| `allstats_search` | Unified search across all BPS content (publications, tables, press releases, infographics, microdata, glossary, classifications) |
| `allstats_deep_search` | Full-text search inside BPS PDF publications — **unique feature, not available via WebAPI** |

## How AI Uses This Server

```
User: "What was Indonesia's poverty rate in 2023?"

AI uses: find_data(query="poverty", region="Indonesia", year="2023")

Internal process (automatic):
1. Intent Detection: "single_value" → find_data
2. Resolve "Indonesia" → domain 0000
3. Normalize: "poverty" → stopword filtering
4. Find relevant subject → "Kemiskinan dan Ketimpangan"
5. Find variable → "Jumlah Penduduk Miskin" (var_id: 183)
6. Resolve "2023" → period ID 123
7. Fetch data → 25.9 million people
8. Result hints: "Check Gini ratio: get_dynamic_data(var="98")"

If find_data fails, the AI can:
- find_variable(keyword="poverty") → see available variables
- list_strategic_indicators() → latest headline data
- search(keyword="poverty") → find related tables/publications

User: "Compare poverty in East Java and West Java"
AI uses: compare_data(query="poverty", regions="Jawa Timur, Jawa Barat")

User: "Trend of unemployment in Indonesia 2019-2024"
AI uses: get_trend(query="unemployment", region="Indonesia", start_year="2019", end_year="2024")

User: "Top 10 poorest provinces"
AI uses: get_ranking(query="poverty", top_n=10, order="highest")

User: "Religious affiliation statistics in Jombang Regency"
AI uses: find_data(query="religion", region="Kab Jombang")
→ Intent: "table" → find_data with static table fallback
→ Automatically fetches "Population by Religion" static table
→ Result hints: "Check more detail: list_static_tables(keyword="religion")"
```

## Example Queries

```
"What was Indonesia's poverty rate in 2023?"
"Compare poverty rates between East Java and West Java 2020-2023"
"Unemployment trend in Indonesia from 2019 to 2024"
"Top 10 provinces with highest poverty rate"
"Rank all provinces by HDI 2023"
"Latest press releases about inflation"
"Indonesia's coffee export data for 2024"
"Find publications about telecommunications statistics"
"Search for 'internet access' inside BPS publications"
"What is East Java's HDI?"
"Latest quarterly economic growth"
"Religious affiliation statistics in Klaten Regency"
"Population distribution per district in Jakarta"
```

## Resources (3)

| URI | Description |
|-----|-------------|
| `bps://domains/provinces` | List of all Indonesian provinces (cached) |
| `bps://domains/regencies/{prov_id}` | Regencies/cities per province |
| `bps://subjects/{domain}` | Statistics subjects per domain |

## Prompts (5)

| Prompt | Description |
|--------|-------------|
| `compare_regions` | Compare statistics between two regions |
| `trend_analysis` | Multi-year data trend analysis |
| `poverty_profile` | Poverty profile of a region |
| `economic_overview` | Regional economic summary |
| `population_stats` | Population statistics |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BPS_API_KEY` | (required) | API key from webapi.bps.go.id |
| `BPS_API_BASE_URL` | `https://webapi.bps.go.id/v1` | API base URL |
| `BPS_DEFAULT_LANG` | `ind` | Default language: `ind` / `eng` |
| `BPS_DEFAULT_DOMAIN` | `0000` | Default domain (0000 = National) |
| `BPS_CACHE_ENABLED` | `true` | Enable caching |
| `BPS_CACHE_MAX_ENTRIES` | `500` | Maximum cache entries |
| `BPS_LOG_LEVEL` | `info` | Log level: debug/info/warn/error |

## Development

### Setup

```bash
git clone https://github.com/Digimetalab/dml-bps-mcp
cd dml-bps-mcp
npm install
```

### Build & Test

```bash
npm run build          # Compile TypeScript
npm run test:unit      # Run unit tests (105+ tests)
npm run lint           # ESLint check
npm run typecheck      # TypeScript type check
```

### Running Locally

```bash
# With environment variable
BPS_API_KEY=your_key npm start

# Or create a .env file (see .env.example)
cp .env.example .env
# Edit .env, fill in BPS_API_KEY
npm start
```

### Testing with MCP Inspector

[MCP Inspector](https://github.com/modelcontextprotocol/inspector) lets you test tools interactively:

```bash
# Install and run inspector
npx @modelcontextprotocol/inspector

# In the inspector UI:
# 1. Transport: stdio
# 2. Command: node
# 3. Args: dist/index.js
# 4. Env: BPS_API_KEY=your_key
```

Or test directly via stdin (without inspector):

```bash
# Test initialize
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | BPS_API_KEY=your_key node dist/index.js

# Test find_data
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"find_data","arguments":{"query":"inflation","region":"Indonesia"}}}\n' | BPS_API_KEY=your_key node dist/index.js
```

### Testing Remote Worker (Local)

```bash
# Start worker locally
npm run dev:worker

# Test in another terminal
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-BPS-API-Key: your_key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

### Project Structure

```
src/
├── auth/           # API key & OAuth2 providers
├── client/         # BPS WebAPI & AllStats HTTP clients
├── config/         # Configuration & defaults
├── prompts/        # MCP prompt templates
├── resources/      # MCP resources (domain lists)
├── services/       # Cache, domain resolver, data formatter
│   ├── intent-detector.ts   # Intent detection (comparison, trend, ranking, table)
│   ├── learning.ts          # Persistent learning store + stopwords-iso
│   ├── domain-resolver.ts   # Fuzzy domain matching
│   └── data-formatter.ts    # Format BPS data to markdown
├── tools/          # MCP tool definitions (39 tools)
│   ├── smart.tools.ts      # find_data, find_variable (AI shortcuts + intent detection)
│   ├── analysis.tools.ts   # compare_data, get_trend, get_ranking
│   ├── dynamic-data.tools.ts  # Core data tools
│   ├── search.tools.ts     # Search with AllStats fallback
│   ├── allstats.tools.ts   # AllStats search & deep search
│   └── ...                  # Domain, publication, trade, etc.
├── transport/      # stdio transport
├── utils/          # Logger and error handling
├── index.ts        # CLI entry point (stdio)
├── worker.ts       # Cloudflare Worker entry point (HTTP)
└── server.ts       # MCP server factory
```

## Support & Donations

This project is developed by **Digimetalab**. If you find this project useful and would like to support ongoing development and server hosting, you can contribute through:

* **Donations:**
  * [GitHub Sponsors](https://github.com/sponsors/Digimetalab)

## Attribution

Source: Badan Pusat Statistik (BPS) — https://www.bps.go.id
This service uses the BPS (Badan Pusat Statistik) API.

## License

MIT
