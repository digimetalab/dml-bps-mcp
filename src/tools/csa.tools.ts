import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BpsClient } from "../client/bps-client.js";
import { formatList } from "../services/data-formatter.js";
import { appendAttribution } from "../services/attribution.js";
import { formatErrorForUser } from "../utils/error.js";

export function registerCsaTools(server: McpServer, client: BpsClient): void {
  server.tool(
    "list_csa_categories",
    "List BPS CSA (Classification of Statistical Activities) categories. CSA is an international statistical activity classification.",
    {
      domain: z.string().default("0000").describe("BPS domain code"),
    },
    async ({ domain }) => {
      try {
        const result = await client.listCsaSubjectCategories(domain);
        const text = formatList(
          result,
          (c) => `**${c.title}** (ID: ${c.subcat_id})`,
          "List of CSA Categories"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_csa_subjects",
    "List CSA subjects for a given domain and category.",
    {
      domain: z.string().default("0000").describe("BPS domain code"),
      subcat: z.number().optional().describe("Filter by CSA category ID"),
    },
    async ({ domain, subcat }) => {
      try {
        const result = await client.listCsaSubjects(domain, subcat);
        const text = formatList(
          result.data,
          (s) => `**${s.title}** (ID: ${s.sub_id}) — Category: ${s.subcat} — ${s.ntabel} tables`,
          "List of CSA Subjects"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_csa_tables",
    "List CSA tables for a given domain and subject.",
    {
      domain: z.string().default("0000").describe("BPS domain code"),
      subject: z.number().optional().describe("Filter by CSA subject ID"),
      page: z.number().optional().describe("Page number"),
    },
    async ({ domain, subject, page }) => {
      try {
        const result = await client.listCsaTables(domain, subject, page);
        const text = formatList(
          result.data,
          (t) => {
            let desc = `**${t.title}** (ID: ${t.id})`;
            if (t.latest_period) desc += ` — Latest period: ${t.latest_period}`;
            desc += ` — Update: ${t.last_update}`;
            return desc;
          },
          "List of CSA Tables"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "get_csa_table",
    "Retrieve details of a single CSA table (includes table content in HTML format).",
    {
      domain: z.string().describe("BPS domain code"),
      id: z.string().describe("CSA table ID"),
    },
    async ({ domain, id }) => {
      try {
        const detail = await client.getCsaTable(domain, id);
        const lines = [
          `## ${detail.title}`,
          "",
          `**ID:** ${detail.table_id}`,
          `**CSA Category:** ${detail.subcsa}`,
          `**Update:** ${detail.updt_date}`,
          "",
          detail.table,
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