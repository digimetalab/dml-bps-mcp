import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BpsClient } from "../client/bps-client.js";
import { formatList } from "../services/data-formatter.js";
import { formatErrorForUser } from "../utils/error.js";

export function registerCensusTools(server: McpServer, client: BpsClient): void {
  server.tool(
    "list_census_events",
    "List BPS census activities (Population Census, Economic Census, Agricultural Census, etc.). Use the activity ID to fetch census topics and data.",
    {},
    async () => {
      try {
        const result = await client.listCensusEvents();
        const text = formatList(
          result,
          (e) => `**${e.kegiatan}** (ID: ${e.id}) — Year: ${e.tahun_kegiatan}`,
          "List of Census Activities"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_census_topics",
    "List data topics available for a specific census activity. Use list_census_events to get the activity ID.",
    {
      kegiatan: z.string().describe("Census activity ID (from list_census_events)"),
    },
    async ({ kegiatan }) => {
      try {
        const result = await client.listCensusTopics(kegiatan);
        const text = formatList(
          result,
          (t) => `**${t.topik}** (ID: ${t.id}) — ${t.topic}`,
          "List of Census Topics"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_census_areas",
    "List available areas/regions for a specific census activity. Use list_census_events to get the activity ID. Returns MFD codes used as wilayah_sensus in get_census_data.",
    {
      kegiatan: z.string().describe("Census activity ID (from list_census_events)"),
    },
    async ({ kegiatan }) => {
      try {
        const result = await client.listCensusAreas(kegiatan);
        const text = formatList(
          result,
          (a) => `**${a.nama}** — MFD: ${a.kode_mfd}`,
          "List of Census Areas"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_census_datasets",
    "List available datasets for a specific census activity and topic. Use list_census_events and list_census_topics first.",
    {
      kegiatan: z.string().describe("Census activity ID (from list_census_events)"),
      topik: z.number().int().describe("Topic ID (from list_census_topics)"),
    },
    async ({ kegiatan, topik }) => {
      try {
        const result = await client.listCensusDatasets(kegiatan, topik);
        const text = formatList(
          result,
          (d) => `**${d.nama}** (ID: ${d.id}) — ${d.deskripsi}`,
          "List of Census Datasets"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "get_census_data",
    "Fetch actual census data for a specific activity, area, and dataset. Use list_census_events, list_census_areas, and list_census_datasets first to get the required IDs.",
    {
      kegiatan: z.string().describe("Census activity ID (from list_census_events)"),
      wilayah_sensus: z.string().describe("Area MFD code (from list_census_areas)"),
      dataset: z.string().describe("Dataset ID (from list_census_datasets)"),
    },
    async ({ kegiatan, wilayah_sensus, dataset }) => {
      try {
        const result = await client.getCensusData(kegiatan, wilayah_sensus, dataset);
        if (!result || result.length === 0) {
          return {
            content: [{ type: "text", text: "Tidak ada data sensus ditemukan untuk parameter yang diberikan." }],
            isError: true,
          };
        }

        const lines = [`## Census Data — ${kegiatan}`, `**Wilayah:** ${result[0].nama_wilayah}`, ""];
        lines.push("| Indikator | Kategori | Periode | Nilai |");
        lines.push("|-----------|----------|---------|-------|");
        for (const row of result.slice(0, 100)) {
          const kategori = [row.kategori_1, row.kategori_2, row.kategori_3, row.kategori_4]
            .filter(Boolean).join(" / ") || "-";
          const nilai = row.nilai !== null && row.nilai !== undefined ? String(row.nilai) : "-";
          lines.push(`| ${row.nama_indikator} | ${kategori} | ${row.period} | ${nilai} |`);
        }
        if (result.length > 100) {
          lines.push(`_... ${result.length - 100} more rows. Use more specific filters to narrow._`);
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );
}
