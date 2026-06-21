import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BpsClient } from "../client/bps-client.js";
import { formatList } from "../services/data-formatter.js";
import { formatErrorForUser } from "../utils/error.js";

export function registerSimdasiTools(server: McpServer, client: BpsClient): void {
  server.tool(
    "list_simdasi_provinces",
    "List 7-digit MFD codes for all provinces used in SIMDASI (Sistem Informasi Manajemen Data Statistik Terintegrasi). Use these codes as the 'wilayah' parameter for other SIMDASI tools.",
    {},
    async () => {
      try {
        const result = await client.listSimdasiProvinceMfds();
        const text = formatList(
          result,
          (a) => `**${a.nama}** — MFD: ${a.kode_mfd}`,
          "List of SIMDASI Province MFD Codes"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_simdasi_regencies",
    "List 7-digit MFD codes for regencies/cities in a province, used in SIMDASI. Use list_simdasi_provinces to get the parent MFD code.",
    {
      parent: z.string().describe("7-digit MFD code of the parent province"),
    },
    async ({ parent }) => {
      try {
        const result = await client.listSimdasiRegencyMfds(parent);
        const text = formatList(
          result,
          (a) => `**${a.nama}** — MFD: ${a.kode_mfd}`,
          "List of SIMDASI Regency MFD Codes"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_simdasi_districts",
    "List 7-digit MFD codes for districts in a regency, used in SIMDASI. Use list_simdasi_regencies to get the parent MFD code.",
    {
      parent: z.string().describe("7-digit MFD code of the parent regency"),
    },
    async ({ parent }) => {
      try {
        const result = await client.listSimdasiDistrictMfds(parent);
        const text = formatList(
          result,
          (a) => `**${a.nama}** — MFD: ${a.kode_mfd}`,
          "List of SIMDASI District MFD Codes"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_simdasi_subjects",
    "List SIMDASI subjects/chapters available for a specific area. Requires a 7-digit MFD wilayah code from list_simdasi_provinces.",
    {
      wilayah: z.string().describe("7-digit MFD code of the area (province/regency)"),
    },
    async ({ wilayah }) => {
      try {
        const result = await client.listSimdasiSubjects(wilayah);
        const text = formatList(
          result,
          (s) => `**${s.judul}** — ID Tabel: ${s.id_tabel} — Tahun: ${s.ketersediaan_tahun.join(", ")}`,
          "List of SIMDASI Subjects"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_simdasi_master_tables",
    "List all SIMDASI master tables available in the system.",
    {},
    async () => {
      try {
        const result = await client.listSimdasiMasterTables();
        const text = formatList(
          result,
          (t) => `**${t.judul}** — Kode: ${t.kode_tabel} (ID: ${t.id_tabel})`,
          "List of SIMDASI Master Tables"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_simdasi_tables",
    "List SIMDASI tables available for a specific area. Requires a 7-digit MFD wilayah code from list_simdasi_provinces.",
    {
      wilayah: z.string().describe("7-digit MFD code of the area"),
    },
    async ({ wilayah }) => {
      try {
        const result = await client.listSimdasiTablesByArea(wilayah);
        const text = formatList(
          result,
          (t) => `**${t.judul}** — Kode: ${t.kode_tabel} — Tahun: ${t.ketersediaan_tahun.join(", ")}`,
          "List of SIMDASI Tables"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_simdasi_tables_by_subject",
    "List SIMDASI tables filtered by area and subject. Requires wilayah (7-digit MFD) and id_subjek from list_simdasi_subjects.",
    {
      wilayah: z.string().describe("7-digit MFD code of the area"),
      id_subjek: z.string().describe("Subject MMS ID from list_simdasi_subjects"),
    },
    async ({ wilayah, id_subjek }) => {
      try {
        const result = await client.listSimdasiTablesByAreaAndSubject(wilayah, id_subjek);
        const text = formatList(
          result,
          (t) => `**${t.judul}** — Kode: ${t.kode_tabel} — Tahun: ${t.ketersediaan_tahun.join(", ")}`,
          "List of SIMDASI Tables by Subject"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "get_simdasi_table",
    "Get detailed data from a SIMDASI table for a specific area and year. Requires wilayah (7-digit MFD), tahun (year), and id_tabel from list_simdasi_tables.",
    {
      wilayah: z.string().describe("7-digit MFD code of the area"),
      tahun: z.number().int().describe("Year of the data (e.g., 2024)"),
      id_tabel: z.string().describe("Table ID from list_simdasi_tables or list_simdasi_tables_by_subject"),
    },
    async ({ wilayah, tahun, id_tabel }) => {
      try {
        const result = await client.getSimdasiTableDetail(wilayah, tahun, id_tabel);
        const lines = [`## ${result.judul}`, `**Wilayah:** ${result.kode_tabel}`, `**Tahun:** ${tahun}`, ""];
        if (result.data && result.data.length > 0) {
          lines.push("| Label | Nilai | Satuan |");
          lines.push("|------|-------|--------|");
          for (const row of result.data) {
            const nilai = row.nilai !== null && row.nilai !== undefined ? String(row.nilai) : "-";
            lines.push(`| ${row.label} | ${nilai} | ${row.satuan ?? "-"} |`);
          }
        } else {
          lines.push("Tidak ada data untuk parameter yang diberikan.");
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );
}
