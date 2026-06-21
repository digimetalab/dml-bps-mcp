# Smart Tools — Detail Logic & Implementation

Complete documentation of internal smart tools logic. Each tool is not just a BPS WebAPI wrapper — there is an intelligence layer to handle inconsistencies and complexity of BPS data structures.

## Table of Contents

1. [find_data](#find_data) — Search & retrieve data in 1 step
2. [get_trend](#get_trend) — Multi-year trend
3. [compare_data](#compare_data) — Cross-region comparison
4. [get_ranking](#get_ranking) — Provincial ranking
5. [Helper Functions](#helper-functions) — Supporting functions

---

## find_data

**File:** `src/tools/smart.tools.ts`  
**Function:** `registerSmartTools` → tool "find_data"

### Purpose

Combines 5-9 API steps into 1 tool call: resolve region → find variable → resolve period → fetch data → format.

### Parameters

| Param | Type | Default | Description |
|-------|------|---------|-----------|
| `query` | string | required | Data description (e.g.: "poverty", "HDI", "unemployment") |
| `region` | string | "Indonesia" | Region name (fuzzy matching) |
| `year` | string? | - | Year, can be multi: "2023" or "2020,2021,2022" |

### Flow Detail

```
┌─ Step 0: Intent Detection ───────────────────────────────────┐
│ detectIntent(query, region, year)                             │
│                                                               │
│ Pattern matching for 6 intents:                              │
│ - single_value: default                                      │
│ - comparison: "compare", "vs", "between X and Y"             │
│ - trend: "trend", "2019-2024", "from...to"                   │
│ - ranking: "ranking", "10 poorest provinces"                 │
│ - table: "religious affiliation", "per sub-district", "distribution"│
│ - publication: "publication", "BRS", "search text inside"    │
│                                                               │
│ Auto-extract params:                                         │
│ - Year range: "2019-2024" → {year: "2019,2024"}             │
│ - Comparison: "between east java and west java" → {region1, region2}│
│                                                               │
│ Output: {intent, confidence, suggestedTool, hints}           │
└───────────────────────────────────────────────────────────────┘
          │
          ▼
┌─ Step 1: Resolve Domain ─────────────────────────────────────┐
│ Input: region="Jawa Timur"                                    │
│ → DomainResolver.resolve("Jawa Timur")                        │
│ → Fuzzy match (Levenshtein + alias: "Jatim"→"Jawa Timur")    │
│ → Output: domain="3500", domainName="Jawa Timur"             │
└───────────────────────────────────────────────────────────────┘
          │
          ▼
┌─ Step 2: Find Variable (3-Layer Lookup) ─────────────────────┐
│                                                               │
│ Layer 1: KNOWN_VARS (hardcoded, 0 I/O)                       │
│   normalizeKeyword("angka kemiskinan") → "kemiskinan"         │
│   resolveCanonical("kemiskinan") → "miskin"                   │
│   KNOWN_VARS["miskin"] → var_id 184 ✓ (only domain 0000)     │
│                                                               │
│ Layer 2: Persistent Store (1 read I/O)                        │
│   store.get("miskin:3500") → {var_id:184, title:...}          │
│                                                               │
│ Layer 3: Full Search (5-9 HTTP calls)                         │
│   → getSubjectIdsForKeyword("miskin") → [23]                 │
│   → listSubjects(3500) → match title → more subject IDs      │
│   → listVariables per subject (max 5 subjects)               │
│   → computeRelevanceScore() per variable                     │
│   → Sort by score, return best                               │
│   → learnVar() → save to store for next time                 │
│                                                               │
│ Fallback 1: Strategic Indicators                              │
│   If Layer 1-3 fail → check list_strategic_indicators        │
│   Match keyword against strategic indicator title             │
│                                                               │
│ Fallback 2: Static Tables                                    │
│   If Strategic Indicators fail → list_static_tables(kw)      │
│   Pick best match → get_static_table() → return HTML table   │
│   (This handles queries like "religious affiliation")        │
└───────────────────────────────────────────────────────────────┘
          │
          ▼
┌─ Step 3: Resolve Period ─────────────────────────────────────┐
│ Input: var_id=184, domain="3500", year="2023"                │
│                                                               │
│ 1. Check period store: lookupPeriod(184, "3500", "2023")     │
│    → Hit: return "123" (0 HTTP calls)                        │
│                                                               │
│ 2. Miss: listPeriods(3500, 184)                              │
│    → Filter: th_name.includes("2023") → th_id=123            │
│    → learnPeriod(184, "3500", "2023", "123")                 │
│    → Return "123"                                            │
│                                                               │
│ 3. Without year: take periods[0] (latest)                    │
└───────────────────────────────────────────────────────────────┘
          │
          ▼
┌─ Step 4: Get Data ───────────────────────────────────────────┐
│ getDynamicData("3500", "184", "123")                         │
│                                                               │
│ Self-Healing:                                                │
│ If datacontent is empty AND var from learning store:         │
│   → invalidateVar("miskin", "3500")                          │
│   → invalidatePeriod(184, "3500", "2023")                    │
│   → Retry: fullSearchVar() → resolvePeriod() → getData()    │
│                                                               │
│ Fallback for regency/city (4 digits, not ending "00"):      │
│   → Calculate parent: domain.slice(0,2)+"00" (3517→3500)    │
│   → lookupVar/fullSearchVar in parent domain                 │
│   → Fetch data from parent domain                            │
│   → Return with note "Data from parent province"             │
│                                                               │
│ Fallback static table (if dynamic data still empty):        │
│   → list_static_tables(domain, kw)                           │
│   → Pick best match → get_static_table() → return            │
└───────────────────────────────────────────────────────────────┘
          │
          ▼
┌─ Step 5: Format & Return ────────────────────────────────────┐
│ formatDynamicData(result, domain, lang)                       │
│ → Decode datacontent keys (vervar+var+turvar+period)         │
│ → Build readable table                                       │
│ → Append BPS attribution                                     │
│ → Generate result hints (generateResultHints)                │
│                                                               │
│ Result Hints:                                                │
│ - For regency/city: "💡 Province data: find_data(...)"       │
│ - For religion: "💡 Breakdown: list_static_tables(...)"      │
│ - For poverty: "💡 Gini ratio: get_dynamic_data(var="98")"  │
│ - For unemployment: "💡 TPAK: find_variable(...)"           │
│                                                               │
│ Success → learnVar() (save mapping for next time)            │
└───────────────────────────────────────────────────────────────┘
```

### Relevance Scoring (`computeRelevanceScore`)

When full search finds many variables, scoring determines which is most relevant:

```
+100  exact phrase match in title ("penduduk miskin" in title)
+50   title starts with query
+40   bonus if ALL query words match
+30   per word that matches in title
+20   title contains "tingkat"/"persentase"/"jumlah" (main indicator)
+15   per word that matches in sub_name
+15   short title (<60 chars, more general)
-15   title has >1 "menurut" (breakdown, less useful)
-20   long title (>100 chars, too specific)

Special heuristics:
+40   query="miskin" + title="persentase" (prefer percentage)
+40   query="jumlah miskin" + title="jumlah" (respect "jumlah" keyword)
+50   query="religion" + title="menurut agama" (prefer religion breakdown)
+30   query="religion" + title="jumlah"/"penduduk"
+60   query asks for regency/city + title contains "kabupaten"
```

### HTTP Calls Summary

| Scenario | HTTP Calls |
|----------|-----------|
| Known var + known period (warm) | 1 |
| Known var + unknown period | 2 |
| Unknown var (cold) | 5-9 (then learn) |
| Repeat query (after learn) | 1-2 |

---

## get_trend

**File:** `src/tools/analysis.tools.ts`  
**Function:** `registerAnalysisTools` → tool "get_trend"

### Purpose

Retrieve time-series data for one region within a specific year range, formatted as a trend table with percentage change.

### Parameters

| Param | Type | Default | Description |
|-------|------|---------|-----------|
| `query` | string | required | Indicator (e.g.: "HDI", "poverty") |
| `region` | string | "Indonesia" | Region name |
| `start_year` | string | "2019" | Start year |
| `end_year` | string | "2024" | End year |

### Flow Detail

```
┌─ Step 1: Resolve Domain ─────────────────────────────────────┐
│ Same as find_data Step 1                                      │
│ "Indonesia" → "0000", "Jawa Timur" → "3500"                  │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Step 2: Resolve Variable ───────────────────────────────────┐
│ resolveVariable(client, store, "IPM", "0000")                │
│ → lookupVar() → KNOWN_VARS["ipm"] → var_id 413              │
│                                                               │
│ If miss → full search with:                                 │
│   - Synonym expansion: "ipm" → ["ipm","pembangunan manusia"] │
│   - Variable scoring (prefer non-old, prefer aggregate)      │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Step 3: Get Periods ────────────────────────────────────────┐
│ listPeriods("0000", 413)                                     │
│ → [{th_id:119, th:"2019"}, {th_id:120, th:"2020"}, ...]     │
│                                                               │
│ Build yearToPeriod map:                                      │
│   "2019"→"119", "2020"→"120", ..., "2024"→"124"             │
│                                                               │
│ ⚠️ FALLBACK: If periods is empty:                            │
│   → invalidateVar("IPM", "0000", store)                      │
│   → resolveVariableFullSearch() — find another var           │
│   → listPeriods() again with new var                         │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Step 4: Fetch Data (Multi-Period) ──────────────────────────┐
│ getDynamicData("0000", "413", "119,120,121,122,123,124")     │
│                                                               │
│ Response contains:                                           │
│ - datacontent: {"999941301190": 71.92, ...} (hundreds of entries)│
│ - tahun: [{val:119, label:"2019"}, ...]                      │
│ - vervar: [{val:1100, label:"ACEH"}, ..., {val:9999,...}]    │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Step 5: Parse Datacontent — CRITICAL LOGIC ─────────────────┐
│                                                               │
│ 5a. Build period label map from response.tahun               │
│     {119: "2019", 120: "2020", ..., 124: "2024"}            │
│                                                               │
│ 5b. Find aggregate vervar                                    │
│     Priority:                                                │
│     1. vervar "9999" or label contains "indonesia"           │
│     2. vervar with label <b>...</b> (bold = aggregate)       │
│                                                               │
│ 5c. Filter datacontent                                       │
│     - Only take keys that contain the aggregate vervar       │
│     - Example: filter keys containing "9999"                 │
│       "999941301190" ✓ (INDONESIA, 2019)                     │
│       "110041301190" ✗ (ACEH, 2019)                          │
│                                                               │
│ 5d. Match period IDs — LONGEST FIRST                         │
│     Sort period IDs: ["124","123","122","121","120","119"]   │
│     (longest first to avoid collision)                       │
│                                                               │
│     Problem without longest-first:                           │
│       key "999941301120" contains "120" → match period 120   │
│       BUT also contains "112" → false match period 112!      │
│                                                               │
│     With longest-first:                                      │
│       "124" checked first → match "...1240" → 2024           │
│       "123" checked → match "...1230" → 2023                 │
│       etc.                                                   │
│                                                               │
│ 5e. Filter year range                                        │
│     Only keep data within range start_year..end_year         │
│     (API might return more periods than requested)           │
│                                                               │
│ 5f. Deduplicate                                              │
│     One year = one value (take first match)                  │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Step 6: Format Output ──────────────────────────────────────┐
│ Sort by year ascending                                       │
│ Calculate change (%) per year: (current-prev)/prev * 100     │
│ Calculate total trend: (last-first)/first * 100              │
│                                                               │
│ Output:                                                      │
│ | Year | Value | Change |                                    │
│ | 2019  | 71,92 | -         |                                │
│ | 2020  | 71,94 | +0.0%     |                                │
│ | 2024  | 74,2  | +0.9%     |                                │
│ Trend: up 3.2% from 2019 to 2024                            │
└───────────────────────────────────────────────────────────────┘
```

### Datacontent Key Format

BPS datacontent key is concatenated numeric IDs:

```
Key: "999941301240"
      ├──┤├─┤├┤├─┤├┤
      │    │  │  │  └─ trailing (usually 0)
      │    │  │  └──── period_id (124 = 2024)
      │    │  └─────── turvar (0 = no derivative)
      │    └────────── var_id (413)
      └─────────────── vervar (9999 = INDONESIA)
```

**Note:** This format is not officially documented by BPS. Discovered from reverse-engineering the API response. Length of each segment can vary depending on the number of ID digits.

### Why Longest-First Matching is Needed

```
Period IDs: 112, 119, 120, 121, 122, 123, 124

Key "999941301120" (should be period 112, year 2012):
  - contains("120") → TRUE (false positive! match period 120 = 2020)
  - contains("112") → TRUE (correct match)

With longest-first sort and break after first match:
  - "124" → not found
  - "123" → not found
  - "122" → not found
  - "121" → not found
  - "120" → found! → WRONG (this is actually period 112)

SOLUTION: Sort response period IDs (not request period IDs) longest-first.
Since all period IDs in the response have the same length (3 digits),
we filter based on year range in step 5e as a safety net.
```

---

## compare_data

**File:** `src/tools/analysis.tools.ts`  
**Function:** `registerAnalysisTools` → tool "compare_data"

### Purpose

Compare one indicator across 2+ regions. Each region is resolved and fetched independently.

### Parameters

| Param | Type | Default | Description |
|-------|------|---------|-----------|
| `query` | string | required | Indicator (e.g.: "HDI", "unemployment") |
| `regions` | string | required | Region names separated by comma |
| `year` | string? | - | Data year |

### Flow Detail

```
┌─ Per Region: fetchDataForDomain() ──────────────────────────┐
│                                                               │
│ Input: query="pengangguran", domain="3600", year="2024"      │
│                                                               │
│ 1. resolveVariable(client, store, "pengangguran", "3600")    │
│    → lookupVar() → check store                               │
│    → If miss: full search in subject 6 (Labor)              │
│    → Scoring: prefer "Kabupaten/Kota" variant                │
│    → Return: var_id=157 "TPT Menurut Kabupaten/Kota"         │
│                                                               │
│ 2. listPeriods("3600", 157)                                  │
│    → Find period whose label contains "2024"                 │
│                                                               │
│    ⚠️ FALLBACK 1: If periods is empty                        │
│    → invalidateVar() → resolveVariableFullSearch()            │
│                                                               │
│    ⚠️ FALLBACK 2: If year not found in periods              │
│    → invalidateVar() → resolveVariableFullSearch()            │
│    → listPeriods() again, find year in new var               │
│                                                               │
│ 3. getDynamicData("3600", "157", periodParam)                │
│                                                               │
│ 4. Extract AGGREGATE value from datacontent                  │
│    → Find aggregate vervar:                                  │
│      a. "9999" or label "indonesia" (national)              │
│      b. domain[0:2]+"99" (e.g. "3699" for domain 3600)      │
│      c. label startsWith "<b>" (bold = aggregate)            │
│      d. label contains "provinsi"                            │
│    → Filter datacontent keys that contain the aggregate ID   │
│    → Take the first matching value                           │
│    → Fallback: values[0] if no aggregate found              │
│                                                               │
│ 5. Return: { value: "6.68 percent", varTitle: "TPT..." }     │
└───────────────────────────────────────────────────────────────┘
```

### Variable Scoring (in `resolveVariable`)

When there are multiple variables matching the keyword, scoring determines the selection:

```typescript
score(variable) = {
  +10  if title contains "metode lama"        // AVOID
  +5   if title contains "golongan umur"      // disaggregation
  +5   if title contains "lapangan usaha"     // disaggregation
  +5   if title contains "klasifikasi"        // disaggregation
  +5   if title contains "pendidikan tertinggi" // disaggregation
  -2   if title contains "metode baru"        // PREFER
  -3   if title contains "kabupaten"          // has aggregate
  -3   if title contains "provinsi"           // has aggregate
}
// Sort ascending (lower score = better)
```

**Why disaggregation is deprioritized:**

Variable "TPT Menurut Golongan Umur" has vervar: 15-19, 20-24, 25-29, ..., Total.
- First value (15-19) = 38.85% (very high, not the provincial TPT!)
- Aggregate "Total" exists but is not the first entry

Variable "TPT Menurut Kabupaten/Kota" has vervar: Regency A, Regency B, ..., Province X.
- Entry "Province X" (vervar 3699) = 6.68% (correct!)
- Can be detected via domain+"99" pattern

### Aggregate Vervar Detection

```
Domain 0000 (National):
  → vervar "9999" with label "<b>INDONESIA</b>"

Domain 3500 (Jawa Timur):
  → vervar "35000" with label "Jawa Timur"
  → OR vervar "3599" (pattern: domain[0:2] + "99")
  → OR vervar with label "<b>JAWA TIMUR</b>"

Domain 3600 (Banten):
  → vervar "3699" with label "Provinsi Banten"
  → Pattern: "36" + "99" = "3699"
```

Detection logic (priority):
1. ID = "9999" or label contains "indonesia"
2. ID = `domain.slice(0,2) + "99"` (e.g. "3699")
3. ID = `domain.slice(0,4) + "0"` (e.g. "35000")
4. Label startsWith `<b>` (bold)
5. Label contains "provinsi"

### Unit Filtering

BPS sometimes fills unit with "Tidak Ada Satuan" — this is filtered from output:

```typescript
const unit = varData.unit && !varData.unit.toLowerCase().includes("tidak ada")
  ? ` ${varData.unit}` : "";
```

---

## get_ranking

**File:** `src/tools/analysis.tools.ts`  
**Function:** `registerAnalysisTools` → tool "get_ranking"

### Purpose

Province ranking based on indicator. Always fetches from domain 0000 (national) because per-province data is available there.

### Parameters

| Param | Type | Default | Description |
|-------|------|---------|-----------|
| `query` | string | required | Indicator (e.g.: "HDI", "poverty") |
| `top_n` | number | 10 | Number to display |
| `order` | "highest"/"lowest" | "highest" | Order |
| `year` | string? | - | Year (empty = latest) |

### Flow Detail

```
┌─ Step 1: resolveVariableForRanking() ────────────────────────┐
│ Specific for ranking — prefer variable "Menurut Provinsi"    │
│                                                               │
│ 1. Normalize keyword + stemming                              │
│    "kemiskinan" → roots: ["kemiskinan", "miskin"]            │
│    "ipm" → roots: ["ipm"] + synonyms: ["pembangunan manusia"]│
│                                                               │
│ 2. Map keyword → subject IDs                                 │
│    "ipm" → [26], "miskin" → [23]                             │
│                                                               │
│ 3. Search variable in domain 0000                            │
│                                                               │
│    Pass 1: "Provinsi" + keyword + "persentase/tingkat/indeks"│
│            + recent data validation (≥2020)                  │
│    Example: "Persentase Penduduk Miskin Menurut Provinsi"    │
│            → has "provinsi" ✓, has "miskin" ✓,               │
│              has "persentase" ✓, period ≥2020 ✓              │
│                                                               │
│    Pass 2: "Provinsi" + keyword (without type filter)        │
│            + recent data validation                          │
│                                                               │
│    Pass 3: keyword match only (without "Provinsi")           │
│            → Fallback if no "Provinsi" var exists            │
│                                                               │
│    Fallback: resolveVariable(client, store, query, "0000")   │
│                                                               │
│ ⚠️ RECENT DATA VALIDATION:                                   │
│    Each candidate is checked with listPeriods() — must have  │
│    at least 1 period with label ≥ "2020"                     │
│    This prevents old var (e.g. var 202 only goes up to 2013) │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Step 2: Get Period ─────────────────────────────────────────┐
│ If year is given:                                            │
│   listPeriods("0000", var_id) → find label contains year     │
│ If not:                                                      │
│   Take periods[0] (latest, BPS sorts descending)              │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Step 3: Fetch Data ─────────────────────────────────────────┐
│ getDynamicData("0000", var_id, periodParam)                  │
│                                                               │
│ Response.vervar can contain:                                 │
│ A) Only provinces (34 entries) — if var "Menurut Provinsi"   │
│ B) All regencies/cities + provinces (500+ entries) — if general var│
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Step 4: Filter Vervar to Province Level ────────────────────┐
│                                                               │
│ Strategy:                                                    │
│ 1. Scan all vervar, separate:                                │
│    - vervarLabels: only those with <b>...</b> label (province)│
│      EXCEPT "<b>INDONESIA</b>" (national, not province)      │
│    - allVervarLabels: all entries                            │
│                                                               │
│ 2. Choose which to use:                                      │
│    - If vervarLabels ≥ 10 entries → use (regency/city data)  │
│    - If < 10 → use allVervarLabels (already at province level)│
│                                                               │
│ Why threshold 10:                                            │
│   - Indonesia has 38 provinces                               │
│   - If bold entries ≥ 10, means data is at regency/city level│
│     and bold = province aggregate                            │
│   - If < 10, means variable is already at province level     │
│     (all entries are provinces, no filter needed)            │
│                                                               │
│ 3. Strip HTML tags from label: "<b>ACEH</b>" → "ACEH"       │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Step 5: Extract Values ─────────────────────────────────────┐
│                                                               │
│ Sort vervar IDs longest-first (avoid substring collision)    │
│                                                               │
│ Per datacontent entry:                                        │
│   - Skip if not a number                                     │
│   - Match key against vervar IDs (longest first)             │
│   - Deduplicate: 1 province = 1 value                        │
│                                                               │
│ Example:                                                     │
│   vervar "1100" (ACEH), key "110041301240" → match           │
│   vervar "11" (if exists) → does NOT match first because     │
│   "1100" is longer and checked first                         │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Step 6: Sort & Format ──────────────────────────────────────┐
│ Sort by value (highest/lowest per parameter)                 │
│ Slice to top_n                                               │
│ Format as numbered table                                     │
└───────────────────────────────────────────────────────────────┘
```

### Keyword Stemming (for `matchesTitle`)

```typescript
Input: "kemiskinan"
kwWords: ["kemiskinan"]
roots: ["kemiskinan"]

Stemming rules:
  - ke...an (len>6): "kemiskinan" → "miskin" ✓
  - pe...an (len>6): "pengangguran" → "nganggur"
  - ...an (len>5): "kemiskinan" → "kemiskina" (harmless noise)

Final roots: ["kemiskinan", "miskin", "kemiskina"]
matchesTitle("persentase penduduk miskin") → TRUE (contains "miskin")
```

### Synonym Expansion (for `matchesTitle`)

```typescript
RANKING_SYNONYMS = {
  ipm: ["ipm", "pembangunan manusia"],
  tpt: ["tpt", "pengangguran terbuka"],
  gini: ["gini", "gini rasio"],
}

Input: "ipm"
roots: ["ipm"]
synonyms: ["ipm", "pembangunan manusia"]

matchesTitle("indeks pembangunan manusia menurut provinsi")
  → roots.some(r => title.includes(r)) → "ipm" in title? NO
  → synonyms.some(s => title.includes(s)) → "pembangunan manusia" in title? YES ✓
```

---

## Helper Functions

### `resolveVariable(client, store, query, domain)`

**Location:** `analysis.tools.ts` line ~395

Core function for resolving keyword → var_id. Used by `compare_data` and `get_trend`.

```
Input: query="IPM", domain="3500"

1. lookupVar(query, domain, store)
   → normalizeKeyword("IPM") → "ipm"
   → resolveCanonical("ipm") → "ipm"
   → KNOWN_VARS["ipm"] → var_id 413 (ONLY if domain="0000")
   → store.get("ipm:3500") → cached result (if exists)

2. If miss → Full Search:
   a. Map keyword to subjects: "ipm" → [26]
   b. listSubjects(domain) → match title → add subject IDs
   c. Per subject (max 3):
      - listVariables(domain, subId, page=1, perPage=100)
      - Match title against searchTerms (with synonym expansion)
      - Collect candidates
   d. Score & sort candidates
   e. learnVar() → save to store
   f. Return best candidate
```

### `resolveVariableFullSearch(client, store, query, domain)`

**Location:** `analysis.tools.ts` line ~537

Same as `resolveVariable` but **bypasses** KNOWN_VARS and store. Used as a fallback when cached var proves to have no data.

Differences from `resolveVariable`:
- Skip Layer 1 (KNOWN_VARS) and Layer 2 (store)
- Exclude "metode lama" variables from candidates
- **Validate periods exist** before returning (listPeriods per candidate)
- Slower (more API calls) but more accurate

### `resolveVariableForRanking(client, store, query)`

**Location:** `analysis.tools.ts` line ~635

Specific for `get_ranking`. Always searches in domain 0000.

Differences from `resolveVariable`:
- Prefer variables with "Provinsi" in title
- Recent data validation (≥2020)
- Indonesian language stemming (ke-...-an → root)
- Multi-pass search (strict → relaxed)

### `fetchDataForDomain(client, store, query, domain, year)`

**Location:** `analysis.tools.ts` line ~467

Used by `compare_data`. Fetches one aggregate value for one domain.

```
1. resolveVariable() → var_id
2. listPeriods() → find period for year
3. getDynamicData() → datacontent
4. Find aggregate vervar → extract single value
5. Return formatted value string
```

Self-healing chain:
- periods empty → invalidate + fullSearch
- year not found in periods → invalidate + fullSearch
- datacontent empty → return "N/A"

### `normalizeKeyword(query)` (from `learning.ts`)

Uses **stopwords-iso** for comprehensive noise removal:
- 758 Indonesian stopwords + 1298 English stopwords
- BPS-specific noise: `menurut`, `berdasarkan`, `pemeluk`, `terkait`, etc.

```typescript
"berapa statistik terkait pemeluk agama di kab jombang" → "agama jombang"
"penduduk menurut agama" → "penduduk agama"
"angka kemiskinan terbaru di indonesia" → "kemiskinan indonesia"
"what is the population of jakarta" → "population jakarta"
```

### `resolveCanonical(normalized)` (from `learning.ts`)

Prefer **last matching keyword** (more specific):

```typescript
KEYWORD_ALIASES:
  "kemiskinan" → "miskin"
  "penduduk miskin" → "miskin"
  "nganggur" → "pengangguran"
  "pembangunan manusia" → "ipm"
  "hdi" → "ipm"
  "ketimpangan" → "gini"
  "populasi" → "penduduk"
  "agama" → "agama"
  "religi" → "agama"
  "pemeluk agama" → "agama"

Word-level fallback (check from behind):
  "penduduk agama" → check "agama" first → KEYWORD_ALIASES["agama"] → "agama"
  (not "penduduk" that wins, because "agama" is more specific)
```

---

## Intent Detection (`src/services/intent-detector.ts`)

### Purpose

Detects user intent from natural language query and suggests the best tool + extracts params.

### 6 Intent Types

| Intent | Pattern | Suggested Tool |
|--------|---------|----------------|
| `single_value` | Default (specific value) | `find_data` |
| `comparison` | "compare", "vs", "between X and Y" | `compare_data` |
| `trend` | "trend", "2019-2024", "from...to" | `get_trend` |
| `ranking` | "ranking", "10 poorest provinces" | `get_ranking` |
| `table` | "religious affiliation", "per sub-district", "distribution" | `find_data` (static table fallback) |
| `publication` | "publication", "BRS", "search text inside" | `search` |

### Auto-Extract Params

```typescript
// Year range extraction
"pengangguran 2019-2024" → {year: "2019,2024"}

// Comparison region extraction
"antara jawa timur dan jawa barat" → {region1: "jawa timur", region2: "jawa barat"}
```

### Confidence Scoring

Pattern matching with scoring:
- Match pattern → +30 per pattern
- Multiple regions in query → +20
- Year range in params → +20
- Confidence = min(score / 50, 1)

### Result Hints (`generateResultHints`)

Generate actionable next-step suggestions based on query context:

```typescript
// For regency/city domain
"💡 Province data: find_data(query="...", region="province") [domain: 3500]"

// For religion query
"💡 Detail breakdown: list_static_tables(domain="3517", keyword="agama")"

// For poverty
"💡 Gini ratio: get_dynamic_data(domain="0000", var="98")"
"💡 Poverty line: find_variable(keyword="garis kemiskinan")"

// For unemployment
"💡 TPAK: find_variable(keyword="tpak", domain="...")"

// For HDI
"💡 Historical data: get_trend(query="ipm", region="...")"
```

---

## Self-Healing Pattern

All tools implement automatic invalidation when data is not found:

```
┌─────────────────────────────────────────────────────────────┐
│ TRIGGER                    │ ACTION                          │
├────────────────────────────┼─────────────────────────────────┤
│ listPeriods() → []         │ invalidateVar() + fullSearch    │
│ year not in periods        │ invalidateVar() + fullSearch    │
│ getDynamicData() → empty   │ invalidateVar() + retry         │
│ (find_data only)           │ + invalidatePeriod()            │
└─────────────────────────────────────────────────────────────┘
```

This ensures:
- If BPS changes var_id → automatically find the new one
- If variable is deleted → automatically fallback
- If period structure changes → automatically re-learn
- No manual intervention needed

---

## Persistent Store Keys

```
Variable mappings:
  Key: "{canonical_keyword}:{domain}"
  Value: JSON {var_id, title, sub_name, unit}
  Example: "miskin:3500" → {"var_id":184,"title":"Persentase Penduduk Miskin",...}

Period mappings:
  Key: "period:{var_id}:{domain}:{year}"
  Value: JSON {periodId, year}
  Example: "period:184:3500:2023" → {"periodId":"123","year":"2023"}
```

Storage locations:
- stdio (local): `~/.bps-mcp/learned-vars.json`
- Cloudflare Workers: KV Namespace

---

## Known Limitations & Edge Cases

### 1. Datacontent Key Collision
Period ID "120" could match in a key that actually contains period "112" (because "1120" contains "120"). Mitigation: longest-first matching + year range filter.

### 2. Different Variables Per Domain
HDI in domain 0000 = var 413, in domain 3500 = var 36. KNOWN_VARS is only for domain 0000. Other domains always do full search.

### 3. Semester Data
BPS poverty data is released per semester (March & September). `get_trend` takes one value per year (first match), which could be semester 1 or 2 depending on response order.

### 4. Bold Label Assumption
Province filtering in `get_ranking` depends on BPS using `<b>` tag for province labels. If BPS changes this format, filtering will fail and fall back to all vervar.

### 5. Rate Limiting
`resolveVariableFullSearch` may make many API calls (listVariables + listPeriods per candidate). If BPS rate-limits, some candidates may be skipped.

---

## Development Guide

### Adding New Topics to KNOWN_VARS

File: `src/services/learning.ts`

```typescript
// 1. Add entry in KNOWN_VARS (only for domain 0000)
const KNOWN_VARS = {
  inflasi: [{ var_id: XXX, title: "...", sub_name: "..." }],
};

// 2. Add alias in KEYWORD_ALIASES
const KEYWORD_ALIASES = {
  "laju inflasi": "inflasi",
  "inflation": "inflasi",
};
```

### Adding Synonyms for Variable Search

File: `src/tools/analysis.tools.ts` — find `SEARCH_SYNONYMS`

```typescript
const SEARCH_SYNONYMS: Record<string, string[]> = {
  ipm: ["ipm", "pembangunan manusia", "indeks pembangunan"],
  // Add here:
  inflasi: ["inflasi", "consumer price", "ihk"],
};
```

### Adding Deprioritized Disaggregation

File: `src/tools/analysis.tools.ts` — find `score` function in `resolveVariable`

```typescript
// Add new pattern:
if (t(x).includes("jenis kelamin")) s += 5;
if (t(x).includes("status pekerjaan")) s += 5;
```

### Adding Aggregate Vervar Pattern

File: `src/tools/analysis.tools.ts` — find `aggregateVervar` in `fetchDataForDomain`

```typescript
// Add new pattern for specific domain:
if (vId === domain + "00") { aggregateVervar = vId; break; }
```


---

## Changelog (v0.13.2)

### Fix #1: Data-Formatter Vervar Label Mismatch

**Problem:** All regencies/cities labeled "Situbondo" because `findLongestMatch` incorrectly matched short vervar IDs (1, 2, 3...) via substring.

**Root cause:** Vervar IDs sequential (1=Pacitan, 2=Ponorogo, 12=Situbondo). Key `1049701250` contains "12" (Situbondo) as a substring, when it is actually vervar 10 (Banyuwangi).

**Fix:** `resolveDatacontentKey` now uses positional extraction:
1. Find var_id in key → split key into prefix (vervar) and suffix (period/turvar)
2. Match vervar from prefix via exact match or startsWith
3. Fallback to `findLongestMatch` if positional fails

### Fix #2: get_trend Provincial Aggregate

**Problem:** `get_trend` in provincial domain (3500) takes random regency/city values instead of provincial aggregates.

**Fix:** Expanded aggregate vervar detection:
1. `9999` or label "indonesia" (national)
2. `domain[0:2] + "99"` (e.g. 3599 for domain 3500)
3. `domain[0:4] + "0"` (e.g. 35000)
4. Label `<b>...</b>` or contains "provinsi" or matches `domainName`
5. Label "jumlah" or "total" (last resort)

### Fix #3: Strategic Indicators Fallback

**Problem:** Inflation and GDP are not in KNOWN_VARS and var_id varies per domain. `get_trend` and `compare_data` fail.

**Fix:** If `resolveVariable` returns null, fallback to `list_strategic_indicators`:
- Match keyword against strategic indicator title
- Format data directly from `ind.data` object (key=period, value=value)
- Applies to `get_trend` and `fetchDataForDomain` (compare_data)

### Fix #4: Respect 'jumlah' Keyword

**Problem:** Scoring always prefers "persentase" for poverty, even if the user explicitly asks for "jumlah penduduk miskin".

**Fix:** Check if query contains "jumlah":
- If yes: boost "jumlah" (+40), penalty "persentase" (-10)
- If not: boost "persentase" (+40) as before

### Fix #5: Domain Kab/Kota Fallback

**Problem:** `find_data` in regency/city domain (e.g. Surabaya=3578) often returns empty because of limited variables.

**Fix:** If datacontent is empty AND domain is regency/city (4 digits, not ending in "00"):
1. Calculate parent province: `domain.slice(0,2) + "00"` (3578 → 3500)
2. `lookupVar` or `fullSearchVar` in parent domain
3. Fetch data from parent domain
4. Return with note "Data retrieved from parent province domain"

### Fix #6: Expanded Ranking Synonyms

**Problem:** `get_ranking` fails for "life expectancy", "GDP", "education" because no synonym mapping exists.

**Fix:** Expanded `RANKING_SYNONYMS`:
```
pdrb: ["pdrb", "produk domestik", "pertumbuhan ekonomi"]
harapan hidup: ["harapan hidup", "angka harapan hidup", "umur harapan"]
pendidikan: ["rata-rata lama sekolah", "harapan lama sekolah", "melek huruf"]
penduduk: ["jumlah penduduk", "populasi"]
```

Also expanded `KEYWORD_SUBJECTS` with pdrb→[52], life expectancy→[26,30], education→[26,28].

### Fix #7: Prefer Annual Over Semester

**Problem:** BPS poverty data is released per semester (March & September). `get_trend` could take a random semester.

**Fix:** When mapping year→period, prefer a period whose label exactly matches the year (e.g. "2023") over one that contains the year (e.g. "September 2023"). If an annual match already exists, do not overwrite with semester.

### Fix #8: compare_data Limitation Documented

**Problem:** User asks "compare poverty East Java vs West Java 2020 and 2024" but tool only supports 1 year.

**Fix:** Added note in tool description: "only supports comparison for 1 year. For multi-year comparison, use get_trend per region."
