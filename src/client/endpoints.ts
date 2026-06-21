/**
 * BPS API endpoint URL builders.
 *
 * BPS Web API uses path-based routing:
 *   List:   {baseUrl}/api/list/model/{model}/domain/{domain}/key/{key}/lang/{lang}/?page=X&keyword=Y
 *   View:   {baseUrl}/api/view/model/{model}/domain/{domain}/lang/{lang}/key/{key}/?id=X
 *   Domain: {baseUrl}/api/domain/type/{type}/key/{key}/lang/{lang}/
 *   Trade:  {baseUrl}/api/dataexim/sumber/{s}/kodehs/{hs}/jenishs/{j}/tahun/{y}/periode/{p}/lang/{lang}/key/{key}/
 *   Census: {baseUrl}/api/interoperabilitas/datasource/sensus/id/{id}/key/{key}/
 *   SIMDASI:{baseUrl}/api/interoperabilitas/datasource/simdasi/id/{id}/wilayah/{w}/key/{key}/
 *
 * Path params are inserted into the URL path. Remaining params (page, keyword, etc.)
 * become query string parameters.
 */

/** Parameters that go into the URL path for list/view endpoints */
const PATH_PARAMS = new Set(["domain", "key", "lang", "id", "var", "th", "turvar", "vervar", "turth", "subject", "subcat", "type", "prov"]);

/** Parameters that go into the URL path for the trade (dataexim) endpoint */
const TRADE_PATH_PARAMS = new Set(["sumber", "kodehs", "jenishs", "tahun", "periode", "lang", "key"]);

/** Parameters that go into the URL path for interoperabilitas endpoints */
const INTEROP_PATH_PARAMS = new Set(["datasource", "id", "kegiatan", "Kegiatan", "topik", "Topik", "wilayah", "parent", "Tahun", "id_tabel", "id_subjek", "Wilayah_sensus", "Dataset", "key"]);

/**
 * Build a list URL: /api/list/model/{model}/param1/val1/.../key/{key}/?queryparams
 */
export function buildListUrl(
  baseUrl: string,
  model: string,
  params: Record<string, string | number | undefined>
): string {
  let path = `${baseUrl}/api/list/model/${model}`;
  const queryParams: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    if (PATH_PARAMS.has(key)) {
      path += `/${key}/${encodeURIComponent(String(value))}`;
    } else {
      queryParams[key] = String(value);
    }
  }

  // Ensure path ends with /
  if (!path.endsWith("/")) path += "/";

  const url = new URL(path);
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

/**
 * Build a view URL: /api/view/model/{model}/param1/val1/.../key/{key}/?queryparams
 */
export function buildViewUrl(
  baseUrl: string,
  model: string,
  params: Record<string, string | number | undefined>
): string {
  let path = `${baseUrl}/api/view/model/${model}`;
  const queryParams: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    if (PATH_PARAMS.has(key)) {
      path += `/${key}/${encodeURIComponent(String(value))}`;
    } else {
      queryParams[key] = String(value);
    }
  }

  if (!path.endsWith("/")) path += "/";

  const url = new URL(path);
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

/**
 * Build a domain URL: /api/domain/type/{type}/key/{key}/lang/{lang}/
 */
export function buildDomainUrl(
  baseUrl: string,
  params: Record<string, string | number | undefined>
): string {
  let path = `${baseUrl}/api/domain`;

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    path += `/${key}/${encodeURIComponent(String(value))}`;
  }

  if (!path.endsWith("/")) path += "/";
  return new URL(path).toString();
}

/**
 * Build a trade (dataexim) URL: /api/dataexim/param1/val1/.../key/{key}/
 */
export function buildTradeUrl(
  baseUrl: string,
  params: Record<string, string | number | undefined>
): string {
  let path = `${baseUrl}/api/dataexim`;
  const queryParams: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    if (TRADE_PATH_PARAMS.has(key)) {
      path += `/${key}/${encodeURIComponent(String(value))}`;
    } else {
      queryParams[key] = String(value);
    }
  }

  if (!path.endsWith("/")) path += "/";

  const url = new URL(path);
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

/**
 * Build an interoperabilitas URL: /api/interoperabilitas/datasource/{source}/id/{id}/.../key/{key}/
 */
export function buildInteropUrl(
  baseUrl: string,
  datasource: string,
  params: Record<string, string | number | undefined>
): string {
  let path = `${baseUrl}/api/interoperabilitas/datasource/${datasource}`;
  const queryParams: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    if (INTEROP_PATH_PARAMS.has(key)) {
      path += `/${key}/${encodeURIComponent(String(value))}`;
    } else {
      queryParams[key] = String(value);
    }
  }

  if (!path.endsWith("/")) path += "/";

  const url = new URL(path);
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

export const MODELS = {
  // Domain (special — uses /api/domain/ directly)
  DOMAIN: "domain",

  // Subject & Category
  SUBJECT: "subject",
  SUBJECT_CATEGORY: "subcat",

  // Variables
  VARIABLE: "var",
  VERTICAL_VARIABLE: "vervar",
  DERIVED_VARIABLE: "turvar",
  PERIOD: "th",
  DERIVED_PERIOD: "turth",
  UNIT: "unit",

  // Dynamic data
  DATA: "data",

  // Static tables
  STATIC_TABLE: "statictable",

  // Press Release
  PRESS_RELEASE: "pressrelease",

  // Publication
  PUBLICATION: "publication",

  // Strategic Indicator
  STRATEGIC_INDICATOR: "indicators",

  // Infographic
  INFOGRAPHIC: "infographic",

  // News
  NEWS: "news",

  // News Category
  NEWS_CATEGORY: "newscategory",

  // Glossary
  GLOSSARY: "glosarium",

  // CSA (Classification of Statistical Activities)
  CSA_SUBJECT_CATEGORY: "subcatcsa",
  CSA_SUBJECT: "subjectcsa",
  CSA_TABLE: "tablestatistic",

  // SDGs (Sustainable Development Goals)
  SDGS: "sdgs",

  // SDDS (Special Data Dissemination Standard)
  SDDS: "sdds",

  // Statistical Classifications (KBLI/KBKI)
  KBLI_2009: "kbli2009",
  KBLI_2015: "kbli2015",
  KBLI_2017: "kbli2017",
  KBLI_2020: "kbli2020",
  KBKI_2015: "kbki2015",
} as const;

export const CLASSIFICATION_MODELS = [
  "kbli2009",
  "kbli2015",
  "kbli2017",
  "kbli2020",
  "kbki2015",
] as const;
