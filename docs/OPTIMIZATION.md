# Optimizing `find_data` — Persistent Learning Store

> **See also:** [SMART-TOOLS.md](./SMART-TOOLS.md) for documentation on `get_trend`, `compare_data`, and `get_ranking`.

## Background

### Problem

When an AI model (especially free tier like Sonnet 4.6) receives a question like "what is the poverty rate in East Java", the following flow occurs:

1. AI calls `find_data` → internally: 5-9 HTTP requests to BPS API
2. AI feels the result is insufficient → calls `list_strategic_indicators`
3. AI tries again → calls `get_dynamic_data`
4. AI tries again → calls `find_variable`, `search`, etc.

**Total: 12 tool calls, very slow.**

### Root Cause

1. **`find_data` internal flow has too many HTTP calls:**
   - resolve domain (1 call)
   - list subjects (1 call)
   - list variables per subject (1-5 calls)
   - list periods (1 call)
   - get dynamic data (1 call)
   = 5-9 HTTP requests per invocation

2. **Current learning cache (`learn:` prefix) piggybacks on `ICacheProvider`:**
   - On stdio: `InMemoryCache` → lost on every restart
   - On Workers: `KVCache` → persistent, but mixed with API cache

3. **`cache_clear` tool clears everything** including learned mappings (on stdio)

### Target

- Popular queries: **1-2 HTTP calls** (resolve domain + get data)
- New queries (cold): still 5-9 calls, but **auto-learn** for next time
- Learning **survives restart** and **is not cleared** by `cache_clear`

---

## Architecture

### Layer Lookup (High to Low Priority)

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: KNOWN_VARS (hardcoded)                         │
│ → Popular topics with stable var_id                    │
│ → Instant, zero I/O                                    │
│ → Example: "miskin" → var_id 184                        │
├─────────────────────────────────────────────────────────┤
│ Layer 2: Persistent Learning Store                      │
│ → Learned from previous successful queries            │
│ → 1 read I/O (file/KV)                                │
│ → Shared among all users                              │
├─────────────────────────────────────────────────────────┤
│ Layer 3: Full Search Flow (existing)                    │
│ → list_subjects → list_variables → scoring             │
│ → 5-9 HTTP calls                                       │
│ → Results saved to Layer 2 for next time            │
└─────────────────────────────────────────────────────────┘
```

### Separation of Concerns

```
┌──────────────────────────────────────────────────┐
│ ICacheProvider (existing, unchanged)             │
│ → API response cache                             │
│ → Short TTL, can be lost, can be cleared        │
│ → Keys: "subjects:3500", "variables:3500:23"     │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ IPersistentStore (new)                          │
│ → Learned variable mappings                      │
│ → Long-lived, NOT affected by cache_clear             │
│ → Survives restart                                │
│ → Keys: "miskin:3500" → {var_id, title, ...}     │
└──────────────────────────────────────────────────┘
```

---

## Interface

```typescript
interface IPersistentStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  // No clear() — by design, this data should not be bulk-deleted
}
```

No TTL — data is valid until proven wrong (var_id returns empty data).

---

## Per-Environment Implementation

### stdio (local): `FileStore`

```
Storage: ~/.bps-mcp/learned-vars.json
Format: { "miskin:3500": "{\"var_id\":184,...}", ... }
```

- Read: load file into memory at init, serve from memory
- Write: update memory + flush to disk (debounced, max 1 write per 5 seconds)
- Survive restart: yes (file-based)
- Concurrency: single process, no issue

### Cloudflare Workers: `KVStore`

```
Storage: KV Namespace (can be the same BPS_CACHE, prefix "learn:")
TTL: none (or very long, 365 days)
```

- Read: KV get (already cached at edge ~60s)
- Write: KV put without TTL
- Survive restart: yes (KV persistent)
- Concurrency: eventually consistent (fine for learning)

---

## KNOWN_VARS — Hardcoded Defaults

Popular topics with stable var_id over the years at BPS:

```typescript
const KNOWN_VARS: Record<string, { var_id: number; label: string }[]> = {
  // Poverty
  miskin:        [{ var_id: 184, label: "Persentase Penduduk Miskin" },
                  { var_id: 183, label: "Jumlah Penduduk Miskin (ribu)" }],
  kemiskinan:    [{ var_id: 184, label: "Persentase Penduduk Miskin" }],

  // Unemployment
  pengangguran:  [{ var_id: 543, label: "Tingkat Pengangguran Terbuka (%)" },
                  { var_id: 674, label: "Jumlah Pengangguran" }],
  tpt:           [{ var_id: 543, label: "Tingkat Pengangguran Terbuka (%)" }],

  // IPM
  ipm:           [{ var_id: 413, label: "[Metode Baru] Indeks Pembangunan Manusia (IPM)" }],

  // Inequality
  gini:          [{ var_id: 98, label: "Gini Rasio" }],

  // Population
  penduduk:      [{ var_id: 1452, label: "Jumlah Penduduk" }],

  // Religion — no stable var_id, use static table fallback
  // Inflation — no stable var_id, use strategic indicators
  // PDRB — varies per domain, use strategic indicators
};
```

**Note:** KNOWN_VARS is only for 100% stable keywords. Topics whose var_id varies per domain (PDRB, inflation) still go through search flow or strategic indicators.

---

## `find_data` Flow (After Optimization)

```
Input: query="angka kemiskinan", region="Jawa Timur", year="2023"

1. Resolve domain
   "Jawa Timur" → domain "3500" (via DomainResolver, already cached)

2. Normalize keyword
   "angka kemiskinan" → normalize → "kemiskinan"
   → check KEYWORD_ALIASES → canonical: "miskin"

3. Layer 1: Check KNOWN_VARS
   "miskin" found → var_id = 184
   → SKIP to step 6

4. Layer 2: Check Persistent Store (if Layer 1 misses)
   store.get("miskin:3500") → {var_id: 184, ...}
   → SKIP to step 6

5. Layer 3: Full Search (if Layer 1 & 2 miss)
   → list_subjects → list_variables → scoring
   → bestVar = {var_id: 184, ...}
   → SAVE to persistent store: store.set("miskin:3500", ...)
   → PUSH to Worker (background)

6. Resolve period (if year is provided)
   a. Check period store: "period:184:3500:2023"
      → Hit: periodParam = "171" (0 HTTP calls)
      → Miss: call list_periods → find match → save to period store
   b. If year is not provided → periodParam = undefined (latest data)

7. Get data
   client.getDynamicData("3500", "184", periodParam)

8. Validate & return
   - If data is empty → invalidate var mapping + period mapping
     → fallback to Layer 3 (full search)
   - If data exists → format & return
```

### HTTP Calls Summary

| Scenario | Calls |
|----------|-------|
| Known var + known period | 1 (get_dynamic_data) |
| Known var + unknown period | 2 (list_periods + get_dynamic_data) |
| Known var + no year param | 1 (get_dynamic_data) |
| Unknown var (cold) | 5-9 (full search + get_dynamic_data) |
| Unknown var (cold) + learn | Same, but next time = 1-2 calls |

---

## Self-Healing: Automatic Invalidation

If a learned var_id returns empty data:

```typescript
const result = await client.getDynamicData(domain, varId, period);

if (!result.datacontent || Object.keys(result.datacontent).length === 0) {
  // Invalidate learned mapping
  await store.delete(`${keyword}:${domain}`);
  // Fallback ke full search
  // ... (existing search flow)
}
```

This handles cases where var_id changes — automatically self-corrects without manual intervention.

---

## Keyword Normalization

To improve hit rate, normalize query before lookup using **stopwords-iso**:

```typescript
// stopwords-iso: 758 Indonesian + 1298 English stopwords
// Plus BPS-specific noise words
const ALL_STOPWORDS = new Set([
  ...stopwords.id,  // 758 Indonesian stopwords
  ...stopwords.en,  // 1298 English stopwords
  ...BPS_SPECIFIC_NOISE,  // "menurut", "berdasarkan", "pemeluk", dll
]);
```

Example:
- "berapa statistik terkait pemeluk agama di kab jombang" → "agama jombang"
- "angka kemiskinan terbaru di indonesia" → "kemiskinan indonesia"
- "jumlah penduduk berdasarkan agama" → "penduduk agama"
- "what is the population of jakarta" → "population jakarta"

### Resolve Canonical (Prefer Last Match)

For queries with multiple keywords, prefer the more specific word (last):

```typescript
"penduduk agama" → check "agama" first → KEYWORD_ALIASES["agama"] → "agama"
// "penduduk" does not win, because "agama" is more specific in this context
```

---

## Relationship with Existing Cache

| Aspect | `ICacheProvider` (existing) | `IPersistentStore` (new) |
|-------|----------------------------|---------------------------|
| Purpose | Cache API responses | Learn variable mappings |
| Lifetime | Short (TTL per type) | Permanent (until invalidation) |
| Survive restart | No (stdio) / Yes (KV) | Yes (always) |
| `cache_clear` | All deleted | **Not affected** |
| Data | Raw API responses | `{var_id, title, sub_name, hitCount, lastUsed}` |
| Scope | Per-session performance | Cross-session intelligence |

### Migration

- Remove usage of `cache.set(cacheKey, ...)` with `learn:` prefix in `find_data`
- Replace with `store.set(key, ...)` via `IPersistentStore`
- `ICacheProvider` remains used for API response caching (unchanged)

---

## Impact on Other Tools

- `cache_clear`: only clears API cache, learning store is not affected
- `find_variable`: unchanged (still full search, but can also benefit from learning in the future)
- `get_dynamic_data`: unchanged (low-level tool)

---

## Success Metrics

| Metric | Before | Target |
|--------|---------|--------|
| Tool calls per query (popular topics) | 12 | 1-2 |
| HTTP calls internal find_data (known var + known period) | 5-9 | **1** |
| HTTP calls internal find_data (known var, unknown period) | 5-9 | **2** |
| HTTP calls internal find_data (new topic) | 5-9 | 5-9 (but learns) |
| Repeat query speed | Same | Instant |
| Cross-user benefit | None | Shared via Worker sync |

---

## Fuzzy Keyword Matching in Store

### Problem

Users might type different variations for the same topic:
- "miskin", "kemiskinan", "penduduk miskin", "angka kemiskinan"
- "pengangguran", "nganggur", "tpt", "pengangguran terbuka"

Without fuzzy matching, each variation must have its own entry in the store. Not efficient.

### Solution: Keyword Stemming + Alias Groups

```typescript
// Alias groups — keyword variations referring to the same topic
const KEYWORD_ALIASES: Record<string, string> = {
  // Poverty
  "miskin": "miskin",
  "kemiskinan": "miskin",
  "penduduk miskin": "miskin",
  "warga miskin": "miskin",
  "orang miskin": "miskin",
  "poverty": "miskin",

  // Unemployment
  "pengangguran": "pengangguran",
  "nganggur": "pengangguran",
  "tpt": "pengangguran",
  "pengangguran terbuka": "pengangguran",
  "unemployment": "pengangguran",

  // IPM
  "ipm": "ipm",
  "pembangunan manusia": "ipm",
  "hdi": "ipm",

  // Gini
  "gini": "gini",
  "ketimpangan": "gini",
  "inequality": "gini",

  // Population
  "penduduk": "penduduk",
  "populasi": "penduduk",
  "population": "penduduk",
  "jumlah penduduk": "penduduk",

  // Religion
  "agama": "agama",
  "religi": "agama",
  "keagamaan": "agama",
  "religion": "agama",
  "pemeluk agama": "agama",
};
```

### Flow with Fuzzy Matching

```
Input: "angka kemiskinan jawa timur"

1. Normalize: "kemiskinan"
2. Check KEYWORD_ALIASES: "kemiskinan" → canonical "miskin"
3. Lookup store: "miskin:3500" → {var_id: 184, ...}
4. Hit! Skip search.
```

### Fallback: Substring Matching

If not found in alias table, try substring match against store keys:

```typescript
function findInStore(keyword: string, domain: string, store: Map<string, string>): string | null {
  // 1. Exact match
  const exact = store.get(`${keyword}:${domain}`);
  if (exact) return exact;

  // 2. Alias match
  const canonical = KEYWORD_ALIASES[keyword];
  if (canonical) {
    const aliased = store.get(`${canonical}:${domain}`);
    if (aliased) return aliased;
  }

  // 3. Substring match — keyword contains or is contained by a stored key
  for (const [key, value] of store) {
    const [storedKw, storedDomain] = key.split(":");
    if (storedDomain !== domain) continue;
    if (storedKw.includes(keyword) || keyword.includes(storedKw)) {
      return value;
    }
  }

  return null;
}
```

### When Alias Table is Updated

- Hardcoded for common topics (sufficient for 80% of cases)
- Can be augmented from learned data: if "penduduk miskin:3500" and "miskin:3500" resolve to the same var_id, automatically becomes an alias

---

## Period Learning

### Problem

Every time a user requests data for a specific year, `find_data` must call `list_periods` to translate "2023" → period_id. This is 1 additional HTTP call whose result is actually stable (period_id for a given year rarely changes).

### Solution: Store Period Mapping in Persistent Store

```typescript
// Key format: "period:{var_id}:{domain}:{year}"
// Value: period_id (string)

// Example:
// "period:184:3500:2023" → "171"
// "period:184:3500:2022" → "170"
// "period:543:0000:2023" → "171"
```

### Flow

```
Input: find_data(query="kemiskinan", region="Jawa Timur", year="2023")

1. Resolve var_id → 184 (dari KNOWN_VARS atau store)
2. Check period store: "period:184:3500:2023"
   → Hit: period_id = "171" → skip list_periods call
   → Miss: call list_periods → learn → save "period:184:3500:2023" = "171"
3. get_dynamic_data("3500", "184", "171")
```

### Impact

- **Best case (known var + known period):** 1 HTTP call (only get_dynamic_data)
- Previously: 2 calls (list_periods + get_dynamic_data)
- Saving: 1 HTTP call per request with year parameter

### Invalidation

Period IDs are very stable at BPS (year 2023 always has the same period_id for a given variable). But for safety:
- If get_dynamic_data returns empty with learned period_id → delete period mapping → retry with list_periods

### Data Structure in Store

```typescript
interface LearnedPeriod {
  periodId: string;
  year: string;
  learnedAt: number; // timestamp
}

// Stored in the same IPersistentStore, with prefix "period:"
// Key: "period:{var_id}:{domain}:{year}"
// Value: JSON string of LearnedPeriod
```

---

## Sync Architecture: Worker as Central Brain

### Problem

- stdio local: learning lost on every restart (if using only local files)
- Each instance learns on its own, does not share knowledge

### Solution: Worker as Central Store + Sync

```
┌─────────────────────────────────────────────────────────────┐
│ Cloudflare Worker (KV Namespace: BPS_LEARNING)              │
│ → Single source of truth                                    │
│ → All users (remote + local) contribute & consume          │
├─────────────────────────────────────────────────────────────┤
│ GET  /api/learned-vars → return all learned mappings        │
│ POST /api/learned-vars → add/update mapping                 │
│ GET  /api/learned-periods → return all period mappings      │
│ POST /api/learned-periods → add/update period mapping       │
└─────────────────────────────────────────────────────────────┘
```

### Sync Flow (stdio local)

```
[Server start]
  1. Load local FileStore (instant, offline-capable)
  2. Background: fetch GET /api/learned-vars from Worker
  3. Merge: remote data + local data → update FileStore
  → Now has all knowledge from all users

[Query succeeds via full search]
  1. Save to local FileStore (instant)
  2. Background: POST /api/learned-vars to Worker
  → Next user (remote or other local) also benefits

[Worker query succeeds (remote user)]
  1. Save to KV directly
  2. Local will get it on next sync (server restart or periodic)
```

### Sync Flow (Worker)

```
[Query masuk]
  1. Check KV directly (already persistent)
  2. If miss → full search → save to KV
  → Automatically available to all users
```

### API Endpoints on Worker

```typescript
// GET /api/learned-vars
// Response: { entries: { "miskin:3500": {...}, "pengangguran:0000": {...} } }

// POST /api/learned-vars
// Body: { key: "miskin:3500", value: {...} }
// Response: { ok: true }

// GET /api/learned-periods
// Response: { entries: { "period:184:3500:2023": {...}, ... } }

// POST /api/learned-periods
// Body: { key: "period:184:3500:2023", value: {...} }
// Response: { ok: true }
```

### Offline Resilience

- If Worker is unreachable during sync → use local FileStore only
- If Worker is unreachable during push → queue locally, retry on next start
- FileStore always as fallback → server continues to function offline

### Security

- Endpoint `/api/learned-vars` can be public read (public BPS data)
- Write can be restricted with a simple shared secret or rate limit
- Or: only accept writes from authenticated MCP sessions

---

## Static Table Fallback

### Problem

Some topics (like religion data) are not available as dynamic data (time-series) in the BPS WebAPI, but only as **static tables** (pre-formatted HTML tables).

### Solution: Dual Fallback in `find_data`

`find_data` now has 2 fallback points to static tables:

**Fallback 1:** If `bestVar` is null (no variable found at all)
```
find_data("pemeluk agama", region="kab jombang")
  → normalizeKeyword → "agama"
  → lookupVar → miss (tidak ada di KNOWN_VARS)
  → fullSearchVar → miss (no dynamic variable for religion)
  → tryStrategicIndicators → miss
  → list_static_tables(domain="3517", keyword="agama")
  → Pick best match → get_static_table() → return HTML table
```

**Fallback 2:** If `bestVar` exists but datacontent is empty
```
find_data("pemeluk agama", region="kab jombang")
  → bestVar = {var_id: 9999} (found via full search)
  → getDynamicData → datacontent is empty
  → list_static_tables(domain="3517", keyword="agama")
  → Pick best match → get_static_table() → return HTML table
```

### Example Queries that Benefit

| Query | Dynamic Data? | Fallback |
|-------|---------------|----------|
| "pemeluk agama di kab jombang" | ❌ | ✅ Static table |
| "distribusi penduduk per kecamatan" | ❌ | ✅ Static table |
| "jumlah sekolah menurut kecamatan" | ❌ | ✅ Static table |
| "angka kemiskinan jawa timur" | ✅ | N/A |

---

## Advanced Optimization Ideas (Future)

1. **Batch learning from logs** — analyze query logs, pre-populate persistent store
2. **Confidence score** — track hit rate per learned mapping, prioritize frequently successful ones
3. **Preload popular vars** — on server start, warm up store with top-N queries
4. **Response template** — for popular topics, include context so the AI doesn't need to call other tools
