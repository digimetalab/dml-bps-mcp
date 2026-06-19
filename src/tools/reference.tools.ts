import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BpsClient } from "../client/bps-client.js";
import { formatList } from "../services/data-formatter.js";
import { formatErrorForUser } from "../utils/error.js";

export function registerReferenceTools(server: McpServer, client: BpsClient): void {
  server.tool(
    "list_strategic_indicators",
    `List BPS strategic indicators — latest headline data (inflation, economic growth, poverty, unemployment, HDI, exports/imports, etc.).

Use this tool for a quick summary of key indicators for a region. Data includes the latest value.
For multi-year historical data, use find_data or get_dynamic_data.`,
    {
      domain: z.string().default("0000").describe("BPS domain code"),
      var: z.number().optional().describe("Filter by variable ID"),
      page: z.number().optional().describe("Page number"),
    },
    async ({ domain, var: varId, page }) => {
      try {
        const result = await client.listStrategicIndicators(domain, varId, page);
        const text = formatList(
          result.data,
          (ind) => `**${ind.title}** (ID: ${ind.indicator_id}) — Subject: ${ind.sub_name}`,
          "List of Strategic Indicators"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );
}