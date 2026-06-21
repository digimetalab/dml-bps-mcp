import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { BpsClient } from "../../src/client/bps-client.js";
import { InMemoryCache } from "../../src/services/cache.js";
import type { IAuthProvider } from "../../src/auth/types.js";
import type { Config } from "../../src/config/index.js";

function createMockAuth(): IAuthProvider {
  return {
    authenticate: vi.fn().mockResolvedValue({ authenticated: true, type: "api-key" }),
    getHeaders: vi.fn().mockResolvedValue({}),
    getQueryParams: vi.fn().mockResolvedValue({ key: "test-key" }),
    isExpired: vi.fn().mockReturnValue(false),
    refresh: vi.fn().mockResolvedValue(undefined),
    getType: vi.fn().mockReturnValue("api-key"),
  } as unknown as IAuthProvider;
}

function createConfig(overrides?: Partial<Config>): Config {
  return {
    authType: "api-key",
    apiKey: "test-key",
    apiBaseUrl: "https://webapi.bps.go.id/v1",
    defaultLang: "ind",
    defaultDomain: "0000",
    cacheEnabled: true,
    cacheMaxEntries: 500,
    logLevel: "error",
    ...overrides,
  } as Config;
}

function mockFetch(responseData: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(responseData),
  }));
}

describe("BpsClient SDGs methods", () => {
  let auth: IAuthProvider;
  let cache: InMemoryCache;
  let client: BpsClient;

  beforeEach(() => {
    auth = createMockAuth();
    cache = new InMemoryCache(100);
    client = new BpsClient(auth, cache, createConfig());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("listSdgs", () => {
    it("should fetch all SDGs indicators", async () => {
      const responseData = {
        status: "OK",
        data: [{ page: 1, pages: 1, total: 3 }, [
          { var_id: 1804, goal_id: 1, title: "Number of Deaths, Disappeared, and Hurt Victims Affected", unit: "Orang" },
          { var_id: 1805, goal_id: 1, title: "Number of Deaths Attributed to Non-Communicable Diseases", unit: "Orang" },
          { var_id: 1806, goal_id: 2, title: "Prevalence of Malnutrition", unit: "Persen" },
        ]],
      };
      mockFetch(responseData);

      const result = await client.listSdgs();
      expect(result.data).toHaveLength(3);
      expect(result.data[0].var_id).toBe(1804);
      expect(result.data[0].goal_id).toBe(1);
    });

    it("should filter SDGs indicators by goal number", async () => {
      const responseData = {
        status: "OK",
        data: [{ page: 1, pages: 1, total: 2 }, [
          { var_id: 1804, goal_id: 1, title: "Goal 1 Indicator A", unit: "Orang" },
          { var_id: 1805, goal_id: 1, title: "Goal 1 Indicator B", unit: "Orang" },
        ]],
      };
      mockFetch(responseData);

      const result = await client.listSdgs(1);
      expect(result.data).toHaveLength(2);
      expect(result.data.every((v) => v.goal_id === 1)).toBe(true);
    });
  });

  describe("getDynamicData for SDGs", () => {
    it("should fetch SDGs data using var_id", async () => {
      const responseData = {
        status: "OK",
        "data-availability": "available",
        var: [{ val: 1804, label: "Number of Deaths", unit: "Orang" }],
        tahun: [{ val: 119, label: "2019" }],
        vervar: [{ kode_vervar: 9999, label_vervar: "INDONESIA", group_vervar: 0, name_group_vervar: "" }],
        datacontent: { "9999180401190": 1250 },
      };
      mockFetch(responseData);

      const result = await client.getDynamicData("0000", "1804");
      expect(result.datacontent).toBeDefined();
      expect(Object.values(result.datacontent!)[0]).toBe(1250);
    });
  });
});
