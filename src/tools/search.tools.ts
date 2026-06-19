import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BpsClient } from "../client/bps-client.js";
import type { AllStatsClient, AllStatsSearchResponse } from "../client/allstats-client.js";
import { appendAttribution } from "../services/attribution.js";
import { formatErrorForUser } from "../utils/error.js";
import { BpsNotFoundError } from "../utils/error.js";
import { logger } from "../utils/logger.js";

/** Map WebAPI type names to AllStats content types */
const WEBAPI_TO_ALLSTATS_CONTENT: Record<string, string> = {
  statictable: "table",
  pressrelease: "pressrelease",
  publication: "publication",
  strategicindicator: "table",
};

function formatAllStatsFallback(res: AllStatsSearchResponse): string {
  const lines: string[] = [];
  lines.push(`### Results from AllStats Search (fallback)`);
  lines.push(
    `Found **${res.totalResults.toLocaleString("id-ID")}** results via AllStats Search Engine`
  );
  lines.push("");

  for (let i = 0; i < res.results.length; i++) {
    const r = res.results[i];
    lines.push(`**${i + 1}. ${r.title}**`);
    if (r.description) lines.push(`> ${r.description}`);
    lines.push(`- Type: ${r.contentType} | Source: ${r.domain}`);
    if (r.url) lines.push(`- URL: ${r.url}`);
    if (r.deepSearchId) {
      lines.push(
        `- Deep Search ID: \`${r.deepSearchId}\` _(use allstats_deep_search to search within this publication)_`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function registerSearchTools(
  server: McpServer,
  client: BpsClient,
  allStatsClient?: AllStatsClient
): void {
  server.tool(
    "search",
    `Cross-type search across BPS content (static tables, publications, press releases, indicators).

When to use this tool:
- Searching for static tables or publications by topic
- Searching for the latest press releases (BRS)
- General search when find_data returns no results

When NOT to use this tool:
- If user asks for specific numeric data → use find_data
- If you already know the variable ID → use get_dynamic_data

If WebAPI finds no results, it automatically falls back to the AllStats Search Engine.`,
    {
      domain: z.string().default("0000").describe("BPS domain code"),
      keyword: z.string().describe("Search keyword"),
      type: z
        .string()
        .optional()
        .describe(
          "Filter by result type: 'statictable', 'pressrelease', 'publication', 'strategicindicator' (optional)"
        ),
      page: z.number().optional().describe("Page number"),
    },
    async ({ domain, keyword, type, page }) => {
      // --- Step 1: Try WebAPI ---
      let webapiError: unknown = null;

      const searchWebAPI = async (kw: string) => {
        try {
          const res = await client.search(domain, kw, type, page);
          if (res.data && res.data.length > 0) return res;
        } catch (err) {
          webapiError = err;
          logger.debug(`WebAPI search failed for "${kw}": ${err instanceof Error ? err.message : "unknown"}`);
        }
        return null;
      };

      let webapiResult = await searchWebAPI(keyword);

      // Fallback Strategy: If empty and keyword has multiple words, try splitting it
      if (!webapiResult && keyword.split(/\s+/).length > 1) {
        const words = keyword.split(/\s+/);
        // Try last 2 words
        const lastTwo = words.slice(-2).join(" ");
        logger.debug(`WebAPI search fallback: retrying with "${lastTwo}"`);
        webapiResult = await searchWebAPI(lastTwo);

        if (!webapiResult) {
          // Try first 2 words
          const firstTwo = words.slice(0, 2).join(" ");
          logger.debug(`WebAPI search fallback: retrying with "${firstTwo}"`);
          webapiResult = await searchWebAPI(firstTwo);
        }
      }

      // Check if WebAPI returned data
      const webapiHasData =
        webapiResult !== null &&
        Array.isArray(webapiResult.data) &&
        webapiResult.data.length > 0;

      if (webapiHasData) {
        // WebAPI returned results — use them
        const text = appendAttribution(
          `## Search Results: "${keyword}"\n\n` +
            "```json\n" +
            JSON.stringify(webapiResult, null, 2) +
            "\n```"
        );
        return { content: [{ type: "text", text }] };
      }

      // --- Step 2: Fallback to AllStats ---
      if (allStatsClient) {
        try {
          const allStatsContent =
            type && WEBAPI_TO_ALLSTATS_CONTENT[type]
              ? WEBAPI_TO_ALLSTATS_CONTENT[type]
              : "all";

          const allStatsResult = await allStatsClient.search({
            query: keyword,
            content: allStatsContent as "all",
            domain,
            page: page || 1,
          });

          if (allStatsResult.results.length > 0) {
            const parts: string[] = [];
            parts.push(`## Search Results: "${keyword}"\n`);

            // Indicate fallback if WebAPI was attempted
            if (webapiError) {
              parts.push(
                `> **Note:** BPS WebAPI unavailable (${webapiError instanceof Error ? webapiError.message : "error"}). Showing results from AllStats Search.\n`
              );
            } else if (webapiResult && !webapiHasData) {
              parts.push(
                `> **Note:** BPS WebAPI found no results for "${keyword}". Showing results from AllStats Search.\n`
              );
            }

            parts.push(formatAllStatsFallback(allStatsResult));

            const text = appendAttribution(parts.join("\n"));
            return { content: [{ type: "text", text }] };
          }
        } catch (allStatsError) {
          logger.debug(
            `AllStats fallback also failed for "${keyword}": ${allStatsError instanceof Error ? allStatsError.message : "unknown"}`
          );
          // If both fail, return the original error
        }
      }

      // --- Step 3: Both failed or no results ---
      if (webapiError) {
        // WebAPI had an error and AllStats also failed or not available
        if (webapiError instanceof BpsNotFoundError) {
          return {
            content: [
              {
                type: "text",
                text: `No results found for "${keyword}" in WebAPI or AllStats Search.`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: formatErrorForUser(webapiError) }],
          isError: true,
        };
      }

      // WebAPI returned empty
      return {
        content: [
          {
            type: "text",
            text: `No results found for "${keyword}".`,
          },
        ],
        isError: true,
      };
    }
  );
}