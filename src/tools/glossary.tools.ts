import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BpsClient } from "../client/bps-client.js";
import { formatList } from "../services/data-formatter.js";
import { formatErrorForUser } from "../utils/error.js";

export function registerGlossaryTools(server: McpServer, client: BpsClient): void {
  server.tool(
    "get_glossary",
    "Get detailed definition of a specific glossary term by its ID. Use list_glossary to find term IDs.",
    {
      id: z.string().describe("Glossary term ID (from list_glossary)"),
    },
    async ({ id }) => {
      try {
        const result = await client.getGlossaryDetail(id);
        const src = result._source;
        const lines = [
          `## ${src.judulIndikator || "Glossary Term"}`,
          "",
        ];
        if (src.definisi && src.definisi.trim()) {
          lines.push(`**Definisi:** ${src.definisi}`);
        }
        if (src.konsep) {
          lines.push(`**Konsep:** ${src.konsep}`);
        }
        if (src.satuan && src.satuan !== "-") {
          lines.push(`**Satuan:** ${src.satuan}`);
        }
        if (src.sumberData) {
          lines.push(`**Sumber Data:** ${src.sumberData}`);
        }
        if (src.sumberKonten) {
          lines.push(`**Sumber Konten:** ${src.sumberKonten}`);
        }
        if (src.ukuran) {
          lines.push(`**Ukuran:** ${src.ukuran}`);
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

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
            let desc = `**${src.judulIndikator}** (ID: ${g._id})`;
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