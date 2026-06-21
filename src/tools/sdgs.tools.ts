import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BpsClient } from "../client/bps-client.js";
import { formatList } from "../services/data-formatter.js";
import { formatErrorForUser } from "../utils/error.js";

export function registerSdgsTools(server: McpServer, client: BpsClient): void {
  server.tool(
    "list_sdgs",
    "List Sustainable Development Goals (SDGs) indicators from BPS. Optionally filter by goal number (1-17). Each indicator has a var_id that can be used with get_dynamic_data to fetch actual values. Domain is always 0000 (National).",
    {
      goal: z.number().int().min(1).max(17).optional().describe("Goal number to filter (1-17). Omit to list all SDG indicators."),
    },
    async ({ goal }) => {
      try {
        const result = await client.listSdgs(goal);
        const text = formatList(
          result.data,
          (v) => {
            const goalStr = v.goal_id ? `[Goal ${v.goal_id}]` : "";
            return `**${v.title}** ${goalStr} — Var ID: ${v.var_id}${v.unit ? ` — Unit: ${v.unit}` : ""}`;
          },
          goal ? `SDGs Indicators — Goal ${goal}` : "All SDGs Indicators"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "get_sdgs_data",
    "Fetch actual SDGs indicator data for a specific variable. Use list_sdgs first to find the var_id, then call this to get the data values.",
    {
      var_id: z.number().int().describe("Variable ID from list_sdgs"),
      year: z.string().optional().describe("Year filter (e.g., '2023'). Omit for latest."),
    },
    async ({ var_id, year }) => {
      try {
        const dataResult = await client.getDynamicData("0000", String(var_id));
        const datacontent = dataResult.datacontent;
        if (!datacontent || Object.keys(datacontent).length === 0) {
          return {
            content: [{ type: "text", text: `Tidak ada data ditemukan untuk SDGs var_id ${var_id}. Coba gunakan year yang berbeda atau periksa ketersediaan data.` }],
            isError: true,
          };
        }

        const tahun = dataResult.tahun ?? [];
        const periodMap = new Map(tahun.map((t) => {
          const rec = t as unknown as Record<string, unknown>;
          const id = String(rec.val ?? t.th_id);
          const label = String(rec.label ?? t.th_name);
          return [id, label];
        }));

        const lines = [`## SDGs Data — Var ID: ${var_id}`, ""];
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
            lines.push("");
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
