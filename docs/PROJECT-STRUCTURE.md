# DML BPS MCP — Project Structure

```
dml-bps-mcp/
├── src/                          # Source code
│   ├── index.ts                  # CLI entry point (stdio transport)
│   ├── worker.ts                 # Cloudflare Worker entry point (HTTP)
│   ├── server.ts                 # MCP server factory & tool registration
│   │
│   ├── auth/                     # Authentication providers (strategy pattern)
│   │   ├── types.ts              # IAuthProvider interface
│   │   ├── api-key.provider.ts   # BPS API v1 key provider
│   │   ├── oauth2.provider.ts    # WSO2 OAuth2 provider (future)
│   │   ├── oauth-handler.ts      # OAuth authorization handler
│   │   └── factory.ts            # Auto-detect & instantiate provider
│   │
│   ├── client/                   # HTTP clients for BPS API
│   │   ├── bps-client.ts         # Main BPS WebAPI client (all endpoints)
│   │   ├── allstats-client.ts    # AllStats Search Engine client
│   │   ├── endpoints.ts          # URL builders & model constants
│   │   └── types.ts              # API response type definitions
│   │
│   ├── config/                   # Configuration management
│   │   ├── index.ts              # Zod-validated config schema
│   │   ├── defaults.ts           # Default values & constants
│   │   ├── domain-aliases.ts     # Common region name aliases
│   │   └── worker-config.ts      # Cloudflare Worker config
│   │
│   ├── services/                 # Core business logic
│   │   ├── domain-resolver.ts    # Fuzzy region name → domain code
│   │   ├── data-formatter.ts     # Raw BPS data → readable output
│   │   ├── cache.ts              # In-memory LRU cache
│   │   ├── kv-cache.ts           # Cloudflare KV cache adapter
│   │   ├── file-store.ts         # Local filesystem persistent store
│   │   ├── kv-store.ts           # Cloudflare KV persistent store
│   │   ├── persistent-store.ts   # Persistent store interface
│   │   ├── intent-detector.ts    # NL query intent classification
│   │   ├── learning.ts           # Keyword→variable learning store
│   │   └── attribution.ts        # BPS ToU attribution injection
│   │
│   ├── tools/                    # MCP tool handlers (59 tools)
│   │   ├── smart.tools.ts        # find_data, find_variable
│   │   ├── analysis.tools.ts     # compare_data, get_trend, get_ranking
│   │   ├── domain.tools.ts       # list_domains, resolve_domain
│   │   ├── dynamic-data.tools.ts # get_dynamic_data + support tools
│   │   ├── static-table.tools.ts # list/get static tables
│   │   ├── publication.tools.ts  # Publications & press releases
│   │   ├── trade.tools.ts        # Foreign trade data
│   │   ├── reference.tools.ts    # Strategic indicators
│   │   ├── infographic.tools.ts  # Infographics
│   │   ├── news.tools.ts         # News + news categories
│   │   ├── glossary.tools.ts     # Glossary search + detail
│   │   ├── census.tools.ts       # Census events, areas, datasets, data
│   │   ├── simdasi.tools.ts      # SIMDASI integrated statistics
│   │   ├── sdgs.tools.ts         # Sustainable Development Goals
│   │   ├── sdds.tools.ts         # Special Data Dissemination Standard
│   │   ├── classification.tools.ts # KBLI/KBKI classifications
│   │   ├── csa.tools.ts          # CSA subject hierarchy + tables
│   │   ├── search.tools.ts       # Cross-type search
│   │   ├── allstats.tools.ts     # AllStats search & deep search
│   │   └── utility.tools.ts      # cache_clear
│   │
│   ├── resources/                # MCP resource handlers
│   │   └── domain.resources.ts   # Domain list, regencies, subjects
│   │
│   ├── prompts/                  # MCP prompt templates
│   │   └── analysis.prompts.ts   # compare_regions, trend_analysis, etc.
│   │
│   ├── transport/                # Transport layer
│   │   └── stdio.ts              # stdio transport initialization
│   │
│   └── utils/                    # Shared utilities
│       ├── logger.ts             # stderr logger (stdio-safe)
│       └── error.ts              # Error types & user-friendly messages
│
├── tests/                        # Test suites
│   ├── unit/                     # Unit tests (vitest)
│   │   ├── auth/                 # Auth provider tests
│   │   ├── client/               # BPS client tests
│   │   ├── services/             # Service tests
│   │   ├── simdasi.test.ts       # SIMDASI client tests
│   │   ├── sdgs.test.ts          # SDGs client tests
│   │   ├── sdds.test.ts          # SDDS client tests
│   │   ├── classification.test.ts # Classification tests
│   │   ├── census-extended.test.ts # Extended census tests
│   │   ├── news-categories.test.ts # News categories tests
│   │   ├── glossary-detail.test.ts # Glossary detail tests
│   │   ├── comprehensive.test.ts # Edge case coverage
│   │   └── ...                   # Other test files
│   ├── integration/              # Integration tests (live API)
│   └── fixtures/                 # Sample BPS API responses
│
├── docs/                         # Documentation
│   ├── PROJECT-STRUCTURE.md      # This file
│   ├── USER-GUIDE.md             # User guide
│   ├── DEPLOY-WORKERS.md         # Cloudflare Workers deployment
│   ├── OPTIMIZATION.md           # Performance optimization notes
│   ├── SMART-TOOLS.md            # Smart tools internals
│   ├── bps-mcp-planning.md       # Original project plan
│   └── allstats-search-endpoints.md # AllStats API reference
│
├── graphify-out/                 # Knowledge graph output
├── scripts/                      # Utility scripts
├── .github/                      # GitHub Actions workflows
├── .opencode/                    # OpenCode configuration
├── package.json
├── tsconfig.json
├── tsconfig.worker.json
├── wrangler.toml                  # Cloudflare Workers config
├── eslint.config.js
└── README.md
```

## Key Design Decisions

### Dual Transport
The server supports both **stdio** (local) and **Streamable HTTP** (remote via Cloudflare Workers) using shared core logic. Only the entry point and cache implementation differ.

### Strategy Pattern for Auth
Authentication is abstracted behind `IAuthProvider`. Currently implements API key (v1) with OAuth2 (v2/WSO2) ready for future migration.

### In-Flight Request Deduplication
Concurrent identical requests are deduplicated to avoid redundant API calls. The first request starts; subsequent identical requests wait for the same promise.

### Retry with Exponential Backoff
Server errors (5xx) are retried up to 3 times with exponential backoff (500ms, 1s, 2s). Client errors (4xx) are not retried.

### Cache Layer
BPS data changes infrequently (monthly/yearly releases). Caching is aggressive: domain lists (24h), variables (12h), dynamic data (1h), press releases (30min).
