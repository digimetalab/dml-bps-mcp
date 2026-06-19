import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  AllStatsClient,
  AllStatsSearchResponse,
  AllStatsDeepSearchResponse,
} from "../client/allstats-client.js";
import { appendAttribution } from "../services/attribution.js";

// ========== Formatters ==========

function formatSearchResults(res: AllStatsSearchResponse): string {
  const lines: string[] = [];
  lines.push(`## AllStats Search Results: "${res.query}"`);
  lines.push("");
  lines.push(
    `Found **${res.totalResults.toLocaleString("id-ID")}** results (page ${res.currentPage}/${res.totalPages})`
  );
  lines.push("");

  if (res.results.length === 0) {
    lines.push("_No results found._");
    return lines.join("\n");
  }

  for (let i = 0; i < res.results.length; i++) {
    const r = res.results[i];
    lines.push(`### ${i + 1}. ${r.title}`);
    if (r.description) lines.push(`> ${r.description}`);
    lines.push("");
    lines.push(`- **Type:** ${r.contentType}`);
    lines.push(`- **Source:** ${r.domain}`);
    if (r.url) lines.push(`- **URL:** ${r.url}`);
    if (r.deepSearchId) {
      lines.push(
        `- **Deep Search ID:** \`${r.deepSearchId}\` _(use allstats_deep_search to search text within this publication)_`
      );
    }
    lines.push("");
  }

  if (res.currentPage < res.totalPages) {
    lines.push(
      `---\n_Page ${res.currentPage} of ${res.totalPages}. Use the \`page\` parameter to view the next page._`
    );
  }

  return lines.join("\n");
}

function formatDeepSearchResults(res: AllStatsDeepSearchResponse): string {
  const lines: string[] = [];
  const pub = res.publication;

  lines.push(`## Deep Search: "${res.query}"`);
  lines.push("");
  lines.push(`### Publication: ${pub.title}`);
  if (pub.publisher) lines.push(`**Publisher:** ${pub.publisher}`);
  if (pub.publicationUrl) lines.push(`**URL:** ${pub.publicationUrl}`);
  lines.push("");
  lines.push(
    `Found **${res.totalMatches}** matching pages (results page ${res.currentPage}/${res.totalPages})`
  );
  lines.push("");

  if (res.matches.length === 0) {
    lines.push("_No matching pages found._");
    return lines.join("\n");
  }

  for (const match of res.matches) {
    lines.push(`#### Page ${match.pageNumber}`);
    if (match.excerpt) {
      lines.push(`> ${match.excerpt}`);
    }
    if (match.highlights.length > 0) {
      lines.push(`**Keywords:** ${match.highlights.join(", ")}`);
    }
    if (match.pdfViewerUrl) {
      lines.push(`**PDF:** ${match.pdfViewerUrl}`);
    }
    lines.push("");
  }

  if (res.currentPage < res.totalPages) {
    lines.push(
      `---\n_Page ${res.currentPage} of ${res.totalPages}. Use the \`page\` parameter to view the next page._`
    );
  }

  return lines.join("\n");
}

// ========== Tool Registration ==========

export function registerAllStatsTools(
  server: McpServer,
  allStatsClient: AllStatsClient
): void {
  // ---------- allstats_search ----------
  server.tool(
    "allstats_search",
    "Search BPS content via AllStats Search Engine (publications, tables, press releases, infographics, microdata, glossary, classifications). IMPORTANT: This tool has high latency due to proxy/scraping. Use the 'search' tool first as it is much faster. Only use this tool if 'search' finds no results. No API key required.",
    {
      query: z.string().describe("Search keyword"),
      content: z
        .enum([
          "all",
          "publication",
          "table",
          "pressrelease",
          "infographic",
          "microdata",
          "news",
          "glosarium",
          "kbli2020",
          "kbli2017",
          "kbli2015",
          "kbli2009",
        ])
        .default("all")
        .describe(
          "Filter by content type: all, publication, table, pressrelease, infographic, microdata, news, glosarium, kbli2020/2017/2015/2009"
        ),
      domain: z
        .string()
        .default("0000")
        .describe(
          "MFD region code. 'all'=all, '0000'=national, 2 digits=province (e.g. 3500=East Java), 4 digits=regency/city"
        ),
      page: z
        .number()
        .default(1)
        .describe("Page number (10 results per page)"),
      title_only: z
        .boolean()
        .default(false)
        .describe("Search by title only (true) or all fields (false)"),
      year_from: z
        .string()
        .default("all")
        .describe("Filter year from ('all' or year, e.g. '2020')"),
      year_to: z
        .string()
        .default("all")
        .describe("Filter year to ('all' or year, e.g. '2024')"),
      sort: z
        .enum(["terbaru", "relevansi"])
        .default("terbaru")
        .describe("Sort order: 'terbaru' (newest first) or 'relevansi' (relevance)"),
    },
    async ({ query, content, domain, page, title_only, year_from, year_to, sort }) => {
      try {
        const result = await allStatsClient.search({
          query,
          content,
          domain,
          page,
          titleOnly: title_only,
          yearFrom: year_from,
          yearTo: year_to,
          sort,
        });

        const text = appendAttribution(formatSearchResults(result));
        return { content: [{ type: "text", text }] };
      } catch (error) {
        const message =
          error instanceof Error
            ? `AllStats search failed: ${error.message}`
            : "An error occurred while accessing AllStats Search.";
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }
  );

  // ---------- allstats_deep_search ----------
  server.tool(
    "allstats_deep_search",
    "Full-text search inside BPS PDF publications. Returns matching pages with text excerpts. Get publication_id from allstats_search results (deep_search_id field). Unique feature — not available via WebAPI. No API key required.",
    {
      query: z.string().describe("Keyword to search within the publication"),
      publication_id: z
        .string()
        .regex(/^[a-f0-9]{24}$/, "Must be a 24-character hex string")
        .describe(
          "Publication ID (24-character hex) from the BPS publication URL or from the deep_search_id field in allstats_search results"
        ),
      domain: z
        .string()
        .default("0000")
        .describe("MFD region code"),
      page: z
        .number()
        .default(1)
        .describe("Results page (not PDF page)"),
    },
    async ({ query, publication_id, domain, page }) => {
      try {
        const result = await allStatsClient.deepSearch({
          query,
          publicationId: publication_id,
          domain,
          page,
        });

        const text = appendAttribution(formatDeepSearchResults(result));
        return { content: [{ type: "text", text }] };
      } catch (error) {
        const message =
          error instanceof Error
            ? `AllStats deep search failed: ${error.message}`
            : "An error occurred while accessing AllStats Deep Search.";
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }
  );
}