import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BpsClient } from "../client/bps-client.js";
import type { DomainResolver } from "../services/domain-resolver.js";
import { formatList } from "../services/data-formatter.js";
import { appendAttribution } from "../services/attribution.js";
import { formatErrorForUser } from "../utils/error.js";

export function registerDomainTools(
  server: McpServer,
  client: BpsClient,
  resolver: DomainResolver
): void {
  server.tool(
    "list_domains",
    "List BPS domains/regions (province, regency/city). Use type='prov' for provinces, 'kab' for all regencies, 'kabbyprov' for regencies per province.",
    {
      type: z.enum(["all", "prov", "kab", "kabbyprov"]).default("all").describe("Domain type: all, prov (province), kab (regency/city), kabbyprov (regencies per province)"),
      prov: z.string().optional().describe("Province ID (required if type=kabbyprov). Example: '35' for East Java"),
    },
    async ({ type, prov }) => {
      try {
        const result = await client.listDomains(type, prov);
        const text = formatList(
          result.data,
          (d) => `**${d.domain_name}** (code: ${d.domain_id})`,
          "List of Domains/Regions"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "resolve_domain",
    "Convert region name to BPS domain code. Supports official names, abbreviations (Jatim, Jabar, Jogja), and fuzzy matching.",
    {
      query: z.string().describe("Region name to resolve. Example: 'Surabaya', 'Jawa Timur', 'Jatim', '3578'"),
    },
    async ({ query }) => {
      try {
        const result = await resolver.resolve(query);
        if (!result) {
          return {
            content: [{
              type: "text",
              text: appendAttribution(`Region "${query}" not found. Try using the official name or BPS code.`),
            }],
          };
        }
        return {
          content: [{
            type: "text",
            text: appendAttribution(
              `**${result.domainName}**\nDomain code: ${result.domainId}\n\nUse code "${result.domainId}" as the 'domain' parameter in other tools.`
            ),
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );
}