import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BpsClient } from "../client/bps-client.js";
import { CLASSIFICATION_MODELS } from "../client/endpoints.js";
import { formatList } from "../services/data-formatter.js";
import { formatErrorForUser } from "../utils/error.js";

export function registerClassificationTools(server: McpServer, client: BpsClient): void {
  server.tool(
    "list_classifications",
    "List BPS statistical classification entries by model. Supports KBLI (2009/2015/2017/2020 — business classification based on ISIC) and KBKI (2015 — commodity classification). Use 'level' parameter to filter by hierarchy level.",
    {
      model: z.enum(CLASSIFICATION_MODELS).describe("Classification model: kbli2009, kbli2015, kbli2017, kbli2020, or kbki2015"),
      level: z.string().optional().describe("Filter by hierarchy level. For KBLI: kategori, golongan pokok, golongan, subgolongan, kelompok. For KBKI: seksi, divisi, kelompok, kelas, subkelas, kelompok komoditas."),
    },
    async ({ model, level }) => {
      try {
        const result = await client.listClassifications(model, level);
        const text = formatList(
          result.data,
          (e) => `**${e.judul || e.title}** — Kode: ${e.kode}${e.level ? ` — Level: ${e.level}` : ""}`,
          `Classification: ${model}${level ? ` (Level: ${level})` : ""}`
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "get_classification",
    "Get detailed information about a specific statistical classification entry by its ID. Use list_classifications first to find the ID.",
    {
      model: z.enum(CLASSIFICATION_MODELS).describe("Classification model: kbli2009, kbli2015, kbli2017, kbli2020, or kbki2015"),
      id: z.string().describe("Classification entry ID (e.g., 'kbli_2009_01', 'kbki_2015_012')"),
    },
    async ({ model, id }) => {
      try {
        const result = await client.getClassificationDetail(model, id);
        const lines = [
          `## ${result.judul || result.title}`,
          `**Kode:** ${result.kode}`,
          `**Level:** ${result.level}`,
          "",
          `**Deskripsi:** ${result.deskripsi || result.description || "-"}`,
          "",
        ];
        if (result.sebelumnya && result.sebelumnya.length > 0) {
          lines.push(`**Kode sebelumnya:** ${result.sebelumnya.join(", ")}`);
        }
        if (result.turunan && result.turunan.length > 0) {
          lines.push("", "**Turunan:**");
          for (const t of result.turunan) {
            lines.push(`- ${t.judul || t.title} (${t.kode})`);
          }
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );
}
