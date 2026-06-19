import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BpsClient } from "../client/bps-client.js";
import { formatList } from "../services/data-formatter.js";
import { appendAttribution } from "../services/attribution.js";
import { formatErrorForUser } from "../utils/error.js";

export function registerStaticTableTools(server: McpServer, client: BpsClient): void {
  server.tool(
    "list_static_tables",
    "List BPS static tables. Static tables contain pre-formatted data in HTML table format.",
    {
      domain: z.string().default("0000").describe("BPS domain code"),
      keyword: z.string().optional().describe("Search keyword"),
      year: z.number().optional().describe("Filter by year"),
      month: z.number().optional().describe("Filter by month (1-12)"),
      page: z.number().optional().describe("Page number"),
    },
    async ({ domain, keyword, year, month, page }) => {
      try {
        const result = await client.listStaticTables(domain, keyword, year, month, page);
        const text = formatList(
          result.data,
          (t) => `**${t.title}** (ID: ${t.table_id}) — Update: ${t.updt_date}`,
          "List of Static Tables"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "get_static_table",
    "Retrieve details of a single BPS static table (includes table content in HTML format).",
    {
      domain: z.string().describe("BPS domain code"),
      id: z.number().describe("Static table ID"),
    },
    async ({ domain, id }) => {
      try {
        const detail = await client.getStaticTable(domain, id);
        const lines = [
          `## ${detail.title}`,
          "",
          `**ID:** ${detail.table_id}`,
          `**Update:** ${detail.updt_date}`,
          "",
          detail.table, // HTML table content
        ];
        if (detail.excel) {
          lines.push("", `**Download Excel:** ${detail.excel}`);
        }
        const text = appendAttribution(lines.join("\n"));
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );
}