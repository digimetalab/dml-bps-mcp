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

describe("BpsClient Census extended methods", () => {
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

  describe("listCensusAreas", () => {
    it("should fetch census areas for an activity", async () => {
      const responseData = {
        status: "OK",
        data: [{ page: 1, pages: 1, total: 2 }, [
          { id: "1", kode_mfd: "3100000", nama: "DKI Jakarta", slug: "dki-jakarta" },
          { id: "2", kode_mfd: "3200000", nama: "Jawa Barat", slug: "jawa-barat" },
        ]],
      };
      mockFetch(responseData);

      const result = await client.listCensusAreas("sp2020");
      expect(result).toHaveLength(2);
      expect(result[0].nama).toBe("DKI Jakarta");
      expect(result[0].kode_mfd).toBe("3100000");
    });
  });

  describe("listCensusDatasets", () => {
    it("should fetch datasets for an activity and topic", async () => {
      const responseData = {
        status: "OK",
        data: [{ page: 1, pages: 1, total: 1 }, [
          { id: "DS001", id_topik: 1, topic: "Population", id_kegiatan: "sp2020", nama: "Population by Age Group", deskripsi: "Population data broken down by age group" },
        ]],
      };
      mockFetch(responseData);

      const result = await client.listCensusDatasets("sp2020", 1);
      expect(result).toHaveLength(1);
      expect(result[0].nama).toBe("Population by Age Group");
      expect(result[0].id_topik).toBe(1);
    });
  });

  describe("getCensusData", () => {
    it("should fetch census data records", async () => {
      const responseData = {
        data: [
          { id_wilayah: "1", kode_wilayah: "3100000", nama_wilayah: "DKI Jakarta", level_wilayah: "provinsi", id_indikator: "IND001", nama_indikator: "Total Population", kategori_1: "Laki-laki", period: "2020", nilai: 5000000 },
          { id_wilayah: "1", kode_wilayah: "3100000", nama_wilayah: "DKI Jakarta", level_wilayah: "provinsi", id_indikator: "IND001", nama_indikator: "Total Population", kategori_1: "Perempuan", period: "2020", nilai: 4800000 },
        ],
      };
      mockFetch(responseData);

      const result = await client.getCensusData("sp2020", "3100000", "DS001");
      expect(result).toHaveLength(2);
      expect(result[0].nama_indikator).toBe("Total Population");
      expect(result[0].nilai).toBe(5000000);
    });
  });
});
