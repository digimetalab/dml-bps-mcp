import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BpsClient } from "../client/bps-client.js";
import { appendAttribution } from "../services/attribution.js";
import { formatErrorForUser } from "../utils/error.js";

export function registerTradeTools(server: McpServer, client: BpsClient): void {
  server.tool(
    "get_trade_data",
    "Retrieve foreign trade data (exports/imports) by HS code. Data includes value and volume of Indonesia's trade.",
    {
      source: z.enum(["1", "2"]).describe("Data source: '1' for export, '2' for import"),
      hs_code: z.string().describe("HS code (Harmonized System). Example: '0901' for coffee"),
      hs_type: z.string().describe("HS type: '2' for 2-digit, '4' for 4-digit, '6' for 6-digit"),
      year: z.string().describe("Data year. Example: '2024'"),
      period: z.string().describe("Period: '0' for annual, '1'-'12' for monthly"),
    },
    async ({ source, hs_code, hs_type, year, period }) => {
      try {
        const result = await client.getTradeData(
          Number(source) as 1 | 2,
          hs_code,
          hs_type,
          year,
          period
        );
        const sourceLabel = source === "1" ? "Exports" : "Imports";
        const periodLabel = period === "0" ? "Annual" : `Month ${period}`;
        const text = appendAttribution(
          `## Trade Data: ${sourceLabel} — HS ${hs_code}\n\n` +
          `**Year:** ${year} | **Period:** ${periodLabel}\n\n` +
          "```json\n" + JSON.stringify(result, null, 2) + "\n```"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );
}