import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BpsClient } from "../client/bps-client.js";
import { formatList } from "../services/data-formatter.js";
import { appendAttribution } from "../services/attribution.js";
import { formatErrorForUser } from "../utils/error.js";

export function registerInfographicTools(server: McpServer, client: BpsClient): void {
  server.tool(
    "list_infographics",
    "List BPS infographics. Infographics contain easy-to-understand statistical data visualizations.",
    {
      domain: z.string().default("0000").describe("BPS domain code"),
      keyword: z.string().optional().describe("Search keyword"),
      page: z.number().optional().describe("Page number"),
    },
    async ({ domain, keyword, page }) => {
      try {
        const result = await client.listInfographics(domain, keyword, page);
        const pageInfo = result.page ? `\n\n*Page ${result.page.page} of ${result.page.pages} (total: ${result.page.total})*` : "";
        const text = formatList(
          result.data,
          (inf) => `**${inf.title.replace(/\(\d\)\d{4}-\d{2}-\d{2}$/, "").trim()}** (ID: ${inf.inf_id}) — ${inf.date}`,
          "List of BPS Infographics"
        ) + pageInfo;
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "get_infographic",
    "Retrieve details of a single BPS infographic including full description and download link.",
    {
      domain: z.string().describe("BPS domain code"),
      id: z.number().describe("Infographic ID"),
    },
    async ({ domain, id }) => {
      try {
        const inf = await client.getInfographic(domain, id);
        const cleanTitle = inf.title.replace(/\(\d\)\d{4}-\d{2}-\d{2}$/, "").trim();

        // Strip HTML tags from description
        const cleanDesc = inf.desc
          .replace(/<\/?[^>]+(>|$)/g, "")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .trim();

        const lines = [
          `## ${cleanTitle}`,
          "",
          `**Date:** ${inf.date}`,
          "",
          "### Description",
          cleanDesc,
          "",
          `**Image:** ${inf.img}`,
          `**Download:** ${inf.dl}`,
        ];

        if (inf.related && inf.related.length > 0) {
          lines.push("", "### Related Infographics");
          for (const r of inf.related) {
            lines.push(`- ${r.title.replace(/\(\d\)\d{4}-\d{2}-\d{2}$/, "").trim()} (ID: ${r.id})`);
          }
        }

        const text = appendAttribution(lines.join("\n"));
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );
}