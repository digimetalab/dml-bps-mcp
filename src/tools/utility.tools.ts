import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ICacheProvider } from "../services/cache.js";

export function registerUtilityTools(server: McpServer, cache: ICacheProvider | null): void {
  server.tool(
    "cache_clear",
    "Clear BPS data cache. Useful to ensure latest data is fetched directly from the API.",
    {},
    async () => {
      if (cache) {
        await cache.clear();
        return { content: [{ type: "text", text: "Cache cleared successfully." }] };
      }
      return { content: [{ type: "text", text: "Cache is not active." }] };
    }
  );
}