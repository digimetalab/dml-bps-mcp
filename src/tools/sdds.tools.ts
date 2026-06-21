import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BpsClient } from "../client/bps-client.js";
import { formatList } from "../services/data-formatter.js";
import { formatErrorForUser } from "../utils/error.js";

export function registerSddsTools(server: McpServer, client: BpsClient): void {
  server.tool(
    "list_sdds",
    "List Special Data Dissemination Standard (SDDS) indicators from BPS. SDDS covers macroeconomic data following IMF standards. Each indicator has a var_id and model type ('data' or 'statictable') used to fetch actual values. Domain is always 0000 (National).",
    {},
    async () => {
      try {
        const result = await client.listSdds();
        const text = formatList(
          result.data,
          (v) => {
            const modelTag = v.model === "statictable" ? " [Static Table]" : "";
            return `**${v.title}** — Var ID: ${v.var_id}${modelTag}${v.unit ? ` — Unit: ${v.unit}` : ""}`;
          },
          "SDDS Indicators (IMF Standards)"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "get_sdds_data",
    "Fetch actual SDDS indicator data. Use list_sdds first to find the var_id and model type. For 'data' model, this fetches dynamic table data. For 'statictable' model, it fetches a static table.",
    {
      var_id: z.number().int().describe("Variable ID from list_sdds"),
      model: z.enum(["data", "statictable"]).default("data").describe("Model type from list_sdds: 'data' or 'statictable'"),
      year: z.string().optional().describe("Year filter (e.g., '2023'). Omit for latest."),
    },
    async ({ var_id, model, year }) => {
      try {
        if (model === "statictable") {
          const result = await client.getStaticTable("0000", var_id);
          return {
            content: [{ type: "text", text: `## SDDS Static Table\n\n**${result.title}**\n\n${result.table}\n\n_Diperbarui: ${result.updt_date}_` }],
          };
        }

        const dataResult = await client.getDynamicData("0000", String(var_id));
        const datacontent = dataResult.datacontent;
        if (!datacontent || Object.keys(datacontent).length === 0) {
          return {
            content: [{ type: "text", text: `Tidak ada data ditemukan untuk SDDS var_id ${var_id}.` }],
            isError: true,
          };
        }

        const tahun = dataResult.tahun ?? [];
        const periodMap = new Map(tahun.map((t) => {
          const rec = t as unknown as Record<string, unknown>;
          return [String(rec.val ?? t.th_id), String(rec.label ?? t.th_name)];
        }));

        const lines = [`## SDDS Data — Var ID: ${var_id}`, ""];
        const entries = Object.entries(datacontent);

        if (year) {
          const filtered = entries.filter(([key]) => {
            for (const [pid, plabel] of periodMap) {
              if (key.includes(pid) && plabel.includes(year)) return true;
            }
            return false;
          });
          if (filtered.length === 0) {
            lines.push(`Tidak ada data untuk tahun ${year}.`);
          } else {
            lines.push("| Tahun | Nilai |");
            lines.push("|-------|-------|");
            for (const [key, value] of filtered) {
              let matchedYear = year;
              for (const [pid, plabel] of periodMap) {
                if (key.includes(pid)) { matchedYear = plabel; break; }
              }
              lines.push(`| ${matchedYear} | ${value} |`);
            }
          }
        } else {
          lines.push("| Nilai |");
          lines.push("|-------|");
          for (const [, value] of entries.slice(0, 20)) {
            lines.push(`| ${value} |`);
          }
          if (entries.length > 20) {
            lines.push(`_... ${entries.length - 20} more entries. Use year filter to narrow._`);
          }
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );
}
