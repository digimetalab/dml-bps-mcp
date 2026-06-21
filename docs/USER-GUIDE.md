# DML BPS MCP — User Guide

## Overview

DML BPS MCP is a **Model Context Protocol (MCP) server** that bridges official Indonesian statistics data (BPS — Badan Pusat Statistik) to AI clients like Claude Desktop, Claude Code, Cursor, ChatGPT, Gemini, and any MCP-compatible application.

The server exposes **59 tools** covering the full BPS WebAPI v1, plus AI-friendly smart tools, AllStats search, SIMDASI integrated statistics, SDGs, SDDS, and statistical classifications.

## Quick Start

### Prerequisites

- **Node.js** >= 22
- **BPS API key** (free, register at [webapi.bps.go.id](https://webapi.bps.go.id))

### Local via npx

```bash
BPS_API_KEY=your_key npx dml-bps-mcp
```

### Local from source

```bash
git clone https://github.com/Digimetalab/dml-bps-mcp
cd dml-bps-mcp
npm install
npm run build
BPS_API_KEY=your_key npm start
```

### Remote via Cloudflare Workers

The server is publicly available at:

```
https://dml-bps-mcp.digimetalab.workers.dev/mcp
```

For production, self-deploy to your own Cloudflare account (see [DEPLOY-WORKERS.md](DEPLOY-WORKERS.md)).

## Connecting AI Clients

### Claude Desktop

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

### Cursor / VS Code

Add to `~/.cursor/mcp.json` or `.vscode/mcp.json`:

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

### ChatGPT (Remote)

1. Settings → Connectors → Create Connector
2. URL: `https://dml-bps-mcp.digimetalab.workers.dev/mcp`
3. Add header: `X-BPS-API-Key: your_key`

## Tool Categories

### AI-Friendly Smart Tools (5)

Start here for natural language data queries:

| Tool | Best For |
|------|----------|
| `find_data` | Single-region data queries (e.g., "poverty rate in East Java 2023") |
| `compare_data` | Comparing 2+ regions (e.g., "compare poverty in Jakarta vs Surabaya") |
| `get_trend` | Multi-year trends (e.g., "unemployment trend 2019-2024") |
| `get_ranking` | Province rankings (e.g., "top 10 provinces by HDI") |
| `find_variable` | Searching for specific BPS variable IDs |

**Recommended workflow:** Use `find_data` first. If results are too vague, use `find_variable` then `get_dynamic_data`.

### WebAPI Tools (32)

Direct BPS WebAPI v1 access:

| Category | Tools |
|----------|-------|
| **Region** | `list_domains`, `resolve_domain` |
| **Subject & Variable** | `list_subjects`, `list_subject_categories`, `list_variables`, `list_vertical_variables`, `list_derived_variables` |
| **Period & Unit** | `list_periods`, `list_derived_periods`, `list_units` |
| **Data** | `get_dynamic_data` |
| **Static Tables** | `list_static_tables`, `get_static_table` |
| **Press Releases** | `list_press_releases`, `get_press_release` |
| **Publications** | `list_publications`, `get_publication` |
| **Indicators** | `list_strategic_indicators` |
| **Trade** | `get_trade_data` |
| **Infographics** | `list_infographics`, `get_infographic` |
| **News** | `list_news`, `get_news`, `list_news_categories` |
| **Census** | `list_census_events`, `list_census_topics`, `list_census_areas`, `list_census_datasets`, `get_census_data` |
| **CSA** | `list_csa_categories`, `list_csa_subjects`, `list_csa_tables`, `get_csa_table` |
| **Glossary** | `list_glossary`, `get_glossary` |
| **Search** | `search` |
| **Utility** | `cache_clear` |

### AllStats Search Tools (2)

| Tool | Description |
|------|-------------|
| `allstats_search` | Unified search across publications, tables, press releases, infographics, microdata, glossary, classifications |
| `allstats_deep_search` | Full-text search inside BPS PDF publications |

> **Note:** AllStats requires a proxy for Cloudflare Workers (see README). For local usage, it works directly.

### SIMDASI Tools (8)

SIMDASI (Sistem Informasi Manajemen Data Statistik Terintegrasi) provides detailed regional statistics with data down to the district level.

**Workflow for SIMDASI data:**

1. `list_simdasi_provinces` → Get MFD code for the province (e.g., `3100000` for Jakarta)
2. `list_simdasi_subjects` → List available topics/chapters for that area
3. `list_simdasi_tables` → Find specific data tables
4. `get_simdasi_table` → Fetch the actual data

For sub-region drill-down:
- `list_simdasi_regencies` → Get regency MFD codes
- `list_simdasi_districts` → Get district MFD codes

### SDGs Tools (2)

SDGs (Sustainable Development Goals) indicators tracking 17 global goals.

| Tool | Description |
|------|-------------|
| `list_sdgs` | List all SDG indicators, optionally filtered by goal number (1-17) |
| `get_sdgs_data` | Fetch actual indicator values by var_id |

Example: `list_sdgs(goal=1)` → lists all Goal 1 (No Poverty) indicators with their var_ids.

### SDDS Tools (2)

SDDS (Special Data Dissemination Standard) covers macroeconomic indicators following IMF standards.

| Tool | Description |
|------|-------------|
| `list_sdds` | List all SDDS indicators with their model types |
| `get_sdds_data` | Fetch indicator data by var_id and model type |

### Statistical Classification Tools (2)

KBLI (business classification based on ISIC) and KBKI (commodity classification).

| Tool | Description |
|------|-------------|
| `list_classifications` | List entries by model (`kbli2009`, `kbli2015`, `kbli2017`, `kbli2020`, `kbki2015`) with optional level filter |
| `get_classification` | Get full detail of a classification entry by model + ID |

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

## Example Queries

### Using AI-Friendly Smart Tools

```
"Berapa jumlah penduduk Indonesia tahun 2023?"
→ find_data(query="population", region="Indonesia", year="2023")

"Compare poverty rates between East Java and West Java 2023"
→ compare_data(query="poverty", regions="Jawa Timur, Jawa Barat", year="2023")

"Trend of HDI in Indonesia 2019-2024"
→ get_trend(query="IPM", region="Indonesia", start_year="2019", end_year="2024")

"Top 10 provinces with highest poverty rate"
→ get_ranking(query="poverty", top_n=10, order="highest")
```

### Using SIMDASI

```
"Get population data for Jakarta from SIMDASI"
→ list_simdasi_provinces → find Jakarta → "3100000"
→ list_simdasi_tables(wilayah="3100000") → find population table
→ get_simdasi_table(wilayah="3100000", tahun=2023, id_tabel="...")
```

### Using SDGs

```
"What are the SDG indicators for poverty in Indonesia?"
→ list_sdgs(goal=1) → find indicator
→ get_sdgs_data(var_id=1804)
```

### Using Classifications

```
"What are the KBLI 2020 categories?"
→ list_classifications(model="kbli2020")
→ get_classification(model="kbli2020", id="kbli_2020_01")
```

## Development

```bash
npm run build          # Compile TypeScript
npm run test:unit      # Run unit tests (164 tests)
npm run lint           # ESLint check
npm run typecheck      # TypeScript type check

# Run locally
BPS_API_KEY=your_key npm start
```

## License

MIT — see LICENSE file.
