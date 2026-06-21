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

describe("BpsClient SDDS methods", () => {
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

  describe("listSdds", () => {
    it("should fetch all SDDS indicators", async () => {
      const responseData = {
        status: "OK",
        data: [{ page: 1, pages: 1, total: 2 }, [
          { var_id: 1753, title: "Value of Export Oil&Gas - Non Oil&Gas", model: "data", unit: "US$" },
          { var_id: 1754, title: "Value of Import Oil&Gas - Non Oil&Gas", model: "statictable", unit: "US$" },
        ]],
      };
      mockFetch(responseData);

      const result = await client.listSdds();
      expect(result.data).toHaveLength(2);
      expect(result.data[0].var_id).toBe(1753);
      expect(result.data[0].model).toBe("data");
      expect(result.data[1].model).toBe("statictable");
    });
  });

  describe("getDynamicData for SDDS", () => {
    it("should fetch SDDS data using var_id with data model", async () => {
      const responseData = {
        status: "OK",
        "data-availability": "available",
        var: [{ val: 1753, label: "Value of Export Oil&Gas", unit: "US$" }],
        tahun: [{ val: 119, label: "2023" }],
        vervar: [{ kode_vervar: 9999, label_vervar: "INDONESIA", group_vervar: 0, name_group_vervar: "" }],
        datacontent: { "9999175301190": 25000000000 },
      };
      mockFetch(responseData);

      const result = await client.getDynamicData("0000", "1753");
      expect(result.datacontent).toBeDefined();
      expect(Object.values(result.datacontent!)[0]).toBe(25000000000);
    });
  });
});
