import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BpsClient } from "../client/bps-client.js";
import type { Config } from "../config/index.js";
import { formatDynamicData, formatList } from "../services/data-formatter.js";
import { formatErrorForUser } from "../utils/error.js";

export function registerDynamicDataTools(server: McpServer, client: BpsClient, config: Config): void {
  server.tool(
    "list_subjects",
    "List available BPS statistical data subjects for a given domain. Subjects are main data categories (e.g. Population, Poverty, Trade).",
    {
      domain: z.string().default("0000").describe("BPS domain code. '0000' for national. Use resolve_domain to get a code."),
      subcat: z.number().optional().describe("Filter by subject category (optional)"),
    },
    async ({ domain, subcat }) => {
      try {
        const result = await client.listSubjects(domain, subcat);
        const text = formatList(
          result.data,
          (s) => `**${s.title}** (ID: ${s.sub_id}) — ${s.ntabel ?? 0} tables, ${s.nvar ?? 0} variables`,
          "List of Statistical Subjects"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_subject_categories",
    "List BPS statistical subject categories. Categories group related subjects.",
    {
      domain: z.string().default("0000").describe("BPS domain code"),
    },
    async ({ domain }) => {
      try {
        const result = await client.listSubjectCategories(domain);
        const text = formatList(
          result,
          (c) => `**${c.title}** (ID: ${c.subcat_id})`,
          "List of Subject Categories"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_variables",
    "List data variables in BPS dynamic tables. Variables determine specific data you can retrieve (e.g. Population Count, Poverty Rate).",
    {
      domain: z.string().default("0000").describe("BPS domain code"),
      subject: z.number().optional().describe("Filter by subject ID"),
      year: z.number().optional().describe("Filter by year"),
      page: z.number().optional().describe("Page number (default: 1)"),
    },
    async ({ domain, subject, year, page }) => {
      try {
        const result = await client.listVariables(domain, subject, year, page);
        const text = formatList(
          result.data,
          (v) => {
            let desc = `**${v.title}** (ID: ${v.var_id})`;
            if (v.sub_name) desc += ` — Subject: ${v.sub_name}`;
            if (v.unit) desc += ` — Unit: ${v.unit}`;
            if (v.def) desc += `\n   ${v.def}`;
            return desc;
          },
          "List of Variables"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_vertical_variables",
    "List vertical variables (breakdown/disaggregation) for a given variable. Examples: gender, age group.",
    {
      domain: z.string().default("0000").describe("BPS domain code"),
      var: z.number().optional().describe("Variable ID to view its vertical variables"),
    },
    async ({ domain, var: varId }) => {
      try {
        const result = await client.listVerticalVariables(domain, varId);
        const text = formatList(
          result,
          (v) => `**${v.label_vervar}** (ID: ${v.kode_vervar}) — Group: ${v.name_group_vervar}`,
          "List of Vertical Variables"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_derived_variables",
    "List derived variables (aggregated categories). Examples: total, average.",
    {
      domain: z.string().default("0000").describe("BPS domain code"),
      var: z.number().optional().describe("Variable ID"),
    },
    async ({ domain, var: varId }) => {
      try {
        const result = await client.listDerivedVariables(domain, varId);
        const text = formatList(
          result,
          (v) => `**${v.label_turvar}** (ID: ${v.kode_turvar}) — Group: ${v.name_group_turvar}`,
          "List of Derived Variables"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_periods",
    "List available data periods for a given variable. Periods can be years, semesters, quarters, or months.",
    {
      domain: z.string().default("0000").describe("BPS domain code"),
      var: z.number().optional().describe("Variable ID"),
    },
    async ({ domain, var: varId }) => {
      try {
        const result = await client.listPeriods(domain, varId);
        const text = formatList(
          result,
          (p) => `**${p.th_name}** (ID: ${p.th_id})`,
          "List of Data Periods"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_derived_periods",
    "List derived periods for a given variable.",
    {
      domain: z.string().default("0000").describe("BPS domain code"),
      var: z.number().optional().describe("Variable ID"),
    },
    async ({ domain, var: varId }) => {
      try {
        const result = await client.listDerivedPeriods(domain, varId);
        const text = formatList(
          result,
          (p) => `**${p.turth_name}** (ID: ${p.turth_id})`,
          "List of Derived Periods"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_units",
    "List data units used in a given domain. Examples: Person, Percent, Rupiah.",
    {
      domain: z.string().default("0000").describe("BPS domain code"),
    },
    async ({ domain }) => {
      try {
        const result = await client.listUnits(domain);
        const text = formatList(
          result,
          (u) => `**${u.unit}** (ID: ${u.unit_id})`,
          "List of Data Units"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "get_dynamic_data",
    `Fetch data from BPS dynamic tables. This tool requires a specific variable ID.

IMPORTANT: Use find_data first for automatic search. Use this tool only if you already know the var_id.

Common variables (national, domain=0000):
- 1452: Population (thousand people)
- 185: Poverty Percentage
- 523: Open Unemployment Rate (%)
- 108: GDP Growth Rate (%)
- 1706: Human Development Index (HDI)
- 2103: Gini Ratio

Use find_variable to search for other variable IDs.`,
    {
      domain: z.string().describe("BPS domain code. '0000' for national."),
      var: z.string().describe("Variable ID(s) (multiple allowed, comma-separated). Example: '1452' or '1452,1453'"),
      th: z.string().optional().describe("Period/year code(s) (multiple allowed). Example: '2023' or '2020,2021,2022,2023'"),
      turvar: z.string().optional().describe("Derived variable code"),
      vervar: z.string().optional().describe("Vertical variable code"),
      turth: z.string().optional().describe("Derived period code"),
    },
    async ({ domain, var: varId, th, turvar, vervar, turth }) => {
      try {
        const result = await client.getDynamicData(domain, varId, th, turvar, vervar, turth);
        const text = formatDynamicData(result, domain, config.defaultLang);
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );
}