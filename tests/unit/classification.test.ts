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

describe("BpsClient Classification methods", () => {
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

  describe("listClassifications", () => {
    it("should list KBLI 2020 entries", async () => {
      const responseData = {
        status: "OK",
        data: [{ page: 1, pages: 1, total: 2 }, [
          { id: "kbli_2020_01", kode: "01", judul: "Pertanian Tanaman Pangan", level: "kategori" },
          { id: "kbli_2020_02", kode: "02", judul: "Kehutanan", level: "kategori" },
        ]],
      };
      mockFetch(responseData);

      const result = await client.listClassifications("kbli2020");
      expect(result.data).toHaveLength(2);
      expect(result.data[0].kode).toBe("01");
    });

    it("should filter by level", async () => {
      const responseData = {
        status: "OK",
        data: [{ page: 1, pages: 1, total: 1 }, [
          { id: "kbli_2020_011", kode: "011", judul: "Pertanian Jagung", level: "golongan" },
        ]],
      };
      mockFetch(responseData);

      const result = await client.listClassifications("kbli2020", "golongan");
      expect(result.data).toHaveLength(1);
      expect(result.data[0].level).toBe("golongan");
    });

    it("should list KBKI 2015 entries", async () => {
      const responseData = {
        status: "OK",
        data: [{ page: 1, pages: 1, total: 1 }, [
          { id: "kbki_2015_01", kode: "01", judul: "Produk Pertanian", level: "seksi" },
        ]],
      };
      mockFetch(responseData);

      const result = await client.listClassifications("kbki2015");
      expect(result.data).toHaveLength(1);
      expect(result.data[0].judul).toBe("Produk Pertanian");
    });
  });

  describe("getClassificationDetail", () => {
    it("should fetch KBLI detail by ID", async () => {
      const responseData = {
        data: {
          id: "kbli_2020_01",
          kode: "01",
          judul: "Pertanian Tanaman Pangan",
          deskripsi: "This category includes agriculture of food crops",
          level: "kategori",
          turunan: [{ kode: "011", judul: "Tanaman Jagung" }],
        },
      };
      mockFetch(responseData);

      const result = await client.getClassificationDetail("kbli2020", "kbli_2020_01");
      expect(result.judul).toBe("Pertanian Tanaman Pangan");
      expect(result.turunan).toHaveLength(1);
      expect(result.turunan![0].kode).toBe("011");
    });
  });
});
