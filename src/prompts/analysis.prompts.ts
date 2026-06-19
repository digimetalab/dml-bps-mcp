import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer): void {
  server.prompt(
    "compare_regions",
    "Template for comparing statistics between regions",
    {
      region_a: z.string().describe("First region name (e.g., East Java)"),
      region_b: z.string().describe("Second region name (e.g., West Java)"),
      indicator: z.string().optional().describe("Indicator to compare (e.g., poverty, unemployment). Leave empty for a general summary"),
      year: z.string().optional().describe("Data year (e.g., 2023). Leave empty for most recent data"),
    },
    async ({ region_a, region_b, indicator, year }) => {
      const indicatorText = indicator ?? "key indicators (poverty, unemployment, economic growth, HDI)";
      const yearText = year ?? "most recent available";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Compare ${indicatorText} statistics between ${region_a} and ${region_b} for the year ${yearText}.

Steps:
1. Use the resolve_domain tool to get the domain code for both regions
2. Use the list_variables or list_strategic_indicators tool to find relevant variables
3. Use the get_dynamic_data tool to fetch data for both regions
4. Present the comparison in an easy-to-read table format
5. Provide a brief analysis of the differences found

Expected output format:
- Comparison table with columns: Indicator | ${region_a} | ${region_b} | Difference
- 2-3 sentence analysis summary`,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "trend_analysis",
    "Template for multi-year statistical trend analysis",
    {
      region: z.string().describe("Region name (e.g., Indonesia, East Java)"),
      indicator: z.string().describe("Indicator to analyze (e.g., inflation, poverty, unemployment)"),
      start_year: z.string().optional().describe("Start year (e.g., 2019)"),
      end_year: z.string().optional().describe("End year (e.g., 2023)"),
    },
    async ({ region, indicator, start_year, end_year }) => {
      const startText = start_year ?? "2019";
      const endText = end_year ?? "2023";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Analyze the trend of ${indicator} in ${region} from ${startText} to ${endText}.

Steps:
1. Use the resolve_domain tool to get the region's domain code
2. Use the list_variables or search tool to find ${indicator} variables
3. Use the get_dynamic_data tool with the th="${startText},${Number(startText) + 1},${Number(startText) + 2},...,${endText}" parameter to fetch multi-year data
4. Present the data in a time-series table
5. Identify trends (up/down/fluctuating) and key points

Expected output format:
- Table: Year | Value | Change (%)
- Simple ASCII chart if possible
- 3-5 sentence trend analysis, including potential influencing factors`,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "poverty_profile",
    "Poverty profile template for a region",
    {
      region: z.string().describe("Region name (e.g., East Java, Surabaya)"),
      year: z.string().optional().describe("Data year (e.g., 2023)"),
    },
    async ({ region, year }) => {
      const yearText = year ?? "most recent";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Create a poverty profile for ${region} in ${yearText}.

Steps:
1. Use resolve_domain to get the domain code
2. Search for the following data using list_variables and get_dynamic_data:
   - Percentage of poor population
   - Number of poor population (thousand people)
   - Poverty line (IDR/capita/month)
   - Poverty Gap Index (P1)
   - Poverty Severity Index (P2)
3. If available, compare with national figures
4. Search for related press releases using list_press_releases

Output format:
- Poverty data summary in a table
- Comparison with national average
- 3-year trend if data is available
- Related press release sources`,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "economic_overview",
    "Template for regional economic overview",
    {
      region: z.string().describe("Region name (e.g., Jakarta, Bali)"),
      year: z.string().optional().describe("Data year (e.g., 2023)"),
    },
    async ({ region, year }) => {
      const yearText = year ?? "most recent";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Create an economic overview for ${region} in ${yearText}.

Steps:
1. Use resolve_domain to get the domain code
2. Collect key economic indicators using list_strategic_indicators and get_dynamic_data:
   - GRDP (nominal and real)
   - Economic growth (%)
   - Inflation (%)
   - Open Unemployment Rate
   - Human Development Index (HDI)
   - Gini Ratio
3. If available, search for export/import data using get_trade_data
4. Search for related publications using list_publications

Output format:
- Key economic indicator dashboard (table)
- Comparison with previous year and national figures
- 3-5 key highlights
- Data sources and related publications`,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "population_stats",
    "Template for population statistics",
    {
      region: z.string().describe("Region name (e.g., Indonesia, West Java)"),
      year: z.string().optional().describe("Data year (e.g., 2023)"),
    },
    async ({ region, year }) => {
      const yearText = year ?? "most recent";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Show population statistics for ${region} in ${yearText}.

Steps:
1. Use resolve_domain to get the domain code
2. Collect population data using get_dynamic_data and list_strategic_indicators:
   - Total population
   - Population growth rate
   - Population density (people/km²)
   - Sex ratio
   - Dependency ratio
   - Life expectancy
3. If available, search for census data using list_census_events and list_census_topics
4. Search for related static tables using list_static_tables with the keyword "population"

Output format:
- Demographic summary table
- Comparison with previous census if available
- Age and sex distribution if data is available
- Data sources and methodology notes`,
            },
          },
        ],
      };
    }
  );
}
