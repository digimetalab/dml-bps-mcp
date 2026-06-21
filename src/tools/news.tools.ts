import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BpsClient } from "../client/bps-client.js";
import { formatList } from "../services/data-formatter.js";
import { appendAttribution } from "../services/attribution.js";
import { formatErrorForUser } from "../utils/error.js";

export function registerNewsTools(server: McpServer, client: BpsClient): void {
  server.tool(
    "list_news_categories",
    "List BPS news categories (e.g., Sensus dan Survey, Statistik Lain). Use the category name as newscat filter in list_news.",
    {
      domain: z.string().default("0000").describe("BPS domain code"),
    },
    async ({ domain }) => {
      try {
        const result = await client.listNewsCategories(domain);
        const text = formatList(
          result,
          (c) => `**${c.newscat_name}** (ID: ${c.newscat_id})`,
          "List of BPS News Categories"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "list_news",
    "List news from the BPS website. Unlike BRS (Official Statistics News), these are general BPS news items.",
    {
      domain: z.string().default("0000").describe("BPS domain code"),
      keyword: z.string().optional().describe("Search keyword"),
      page: z.number().optional().describe("Page number"),
    },
    async ({ domain, keyword, page }) => {
      try {
        const result = await client.listNews(domain, keyword, page);
        const text = formatList(
          result.data,
          (n) => `**${n.title}** (ID: ${n.news_id}) — ${n.newscat_name} — ${n.rl_date}`,
          "List of BPS News"
        );
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );

  server.tool(
    "get_news",
    "Retrieve details of a single news item from the BPS website.",
    {
      domain: z.string().describe("BPS domain code"),
      id: z.number().describe("News ID"),
    },
    async ({ domain, id }) => {
      try {
        const detail = await client.getNews(domain, id);
        const cleanNews = detail.news
          .replace(/<\/?[^>]+(>|$)/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .trim();

        const lines = [
          `## ${detail.title}`,
          "",
          `**Category:** ${detail.newscat_name}`,
          `**Date:** ${detail.rl_date}`,
          "",
          cleanNews,
        ];

        if (detail.related && detail.related.length > 0) {
          lines.push("", "### Related News");
          for (const r of detail.related) {
            lines.push(`- ${r.title} (ID: ${r.id})`);
          }
        }

        const text = appendAttribution(lines.join("\n"));
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatErrorForUser(error) }], isError: true };
      }
    }
  );
}