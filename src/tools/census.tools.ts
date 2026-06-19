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
}