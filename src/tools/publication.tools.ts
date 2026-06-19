import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BpsClient } from "../client/bps-client.js";
import { formatList } from "../services/data-formatter.js";
import { appendAttribution } from "../services/attribution.js";
import { formatErrorForUser } from "../utils/error.js";

export function registerPublicationTools(server: McpServer, client: BpsClient): void {
  // Press Releases (BRS)
  server.tool(
    "list_press_releases",
    "List BPS Press Releases (Berita Resmi Statistik / BRS). BRS contains the latest official data releases.",
    {
      domain: z.string().default("0000").describe("BPS domain code"),
      keyword: z.string().optional().describe("Search keyword"),
      year: z.number().optional().describe("Filter by year"),
      month: z.number().optional().describe("Filter by month (1-12)"),
      page: z.number().optional().describe("Page number"),
    },
    async ({ domain, keyword, year, month, page }) => {
      try {
        const result = await client.listPressReleases(domain, keyword, year, month, page);
        const text = formatList(
          result.data,
          (pr) => {
            let desc = `**${pr.title}** (ID: ${pr.brs_id}) — ${pr.rl_date}`;
            if (pr.abstract) desc += `\n   ${pr.abstract.substring(0, 200)}...`;
            return desc;
          },
          "List of Press Releases (BRS)"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "get_press_release",
    "Retrieve details of a single BPS Press Release (BRS).",
    {
      domain: z.string().describe("BPS domain code"),
      id: z.number().describe("BRS ID"),
    },
    async ({ domain, id }) => {
      try {
        const pr = await client.getPressRelease(domain, id);
        const lines = [
          `## ${pr.title}`,
          "",
          `**Release Date:** ${pr.rl_date}`,
        ];
        if (pr.abstract) {
          lines.push("", "### Abstract", pr.abstract);
        }
        if (pr.pdf) {
          lines.push("", `**Download PDF:** ${pr.pdf}`);
        }
        const text = appendAttribution(lines.join("\n"));
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  // Publications
  server.tool(
    "list_publications",
    "List BPS publications. Publications contain in-depth analysis and statistical reports.",
    {
      domain: z.string().default("0000").describe("BPS domain code"),
      keyword: z.string().optional().describe("Search keyword"),
      year: z.number().optional().describe("Filter by year"),
      month: z.number().optional().describe("Filter by month (1-12)"),
      page: z.number().optional().describe("Page number"),
    },
    async ({ domain, keyword, year, month, page }) => {
      try {
        const result = await client.listPublications(domain, keyword, year, month, page);
        const text = formatList(
          result.data,
          (pub) => {
            let desc = `**${pub.title}** (ID: ${pub.pub_id}) — ${pub.rl_date}`;
            if (pub.issn) desc += ` — ISSN: ${pub.issn}`;
            return desc;
          },
          "List of Publications"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "get_publication",
    "Retrieve details of a single BPS publication.",
    {
      domain: z.string().describe("BPS domain code"),
      id: z.string().describe("Publication ID"),
    },
    async ({ domain, id }) => {
      try {
        const pub = await client.getPublication(domain, id);
        const lines = [
          `## ${pub.title}`,
          "",
          `**Release Date:** ${pub.rl_date}`,
        ];
        if (pub.issn) lines.push(`**ISSN:** ${pub.issn}`);
        if (pub.abstract) {
          lines.push("", "### Abstract", pub.abstract);
        }
        if (pub.pdf) {
          lines.push("", `**Download PDF:** ${pub.pdf}`);
        }
        const text = appendAttribution(lines.join("\n"));
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );
}