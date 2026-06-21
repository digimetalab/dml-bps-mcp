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

describe("BpsClient News Categories", () => {
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

  describe("listNewsCategories", () => {
    it("should fetch news categories", async () => {
      const responseData = {
        status: "OK",
        data: [{ page: 1, pages: 1, total: 2 }, [
          { newscat_id: 1, newscat_name: "Sensus dan Survey" },
          { newscat_id: 2, newscat_name: "Statistik Lain" },
        ]],
      };
      mockFetch(responseData);

      const result = await client.listNewsCategories("0000");
      expect(result).toHaveLength(2);
      expect(result[0].newscat_name).toBe("Sensus dan Survey");
      expect(result[1].newscat_id).toBe(2);
    });
  });
});
