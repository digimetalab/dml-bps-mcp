import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BpsClient } from "../client/bps-client.js";
import { formatList } from "../services/data-formatter.js";
import { formatErrorForUser } from "../utils/error.js";

export function registerGlossaryTools(server: McpServer, client: BpsClient): void {
  server.tool(
    "list_glossary",
    "Search terms in the BPS statistical glossary. Useful for understanding definitions and meanings of statistical indicators.",
    {
      domain: z.string().default("0000").describe("BPS domain code"),
      keyword: z.string().optional().describe("Search keyword for terms"),
      page: z.number().optional().describe("Page number"),
    },
    async ({ domain, keyword, page }) => {
      try {
        const result = await client.listGlossary(domain, keyword, page);
        const text = formatList(
          result.data,
          (g) => {
            const src = g._source;
            let desc = `**${src.judulIndikator}**`;
            const definisi = src.definisi?.trim();
            if (definisi && definisi !== "." && definisi !== ". Produsen data oleh") {
              desc += `\n   ${definisi.substring(0, 300)}`;
            }
            if (src.satuan && src.satuan !== "-") desc += ` (unit: ${src.satuan})`;
            if (src.sumberData) desc += `\n   _Source: ${src.sumberData}_`;
            return desc;
          },
          "BPS Statistical Glossary"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );
}