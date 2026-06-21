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

describe("BpsClient SIMDASI methods", () => {
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

  describe("listSimdasiProvinceMfds", () => {
    it("should fetch province MFD codes", async () => {
      const responseData = {
        status: "OK",
        data: [{ page: 1, pages: 1, total: 2 }, [
          { id: "1", kode_mfd: "3100000", nama: "DKI Jakarta", slug: "dki-jakarta" },
          { id: "2", kode_mfd: "3200000", nama: "Jawa Barat", slug: "jawa-barat" },
        ]],
      };
      mockFetch(responseData);

      const result = await client.listSimdasiProvinceMfds();
      expect(result).toHaveLength(2);
      expect(result[0].nama).toBe("DKI Jakarta");
      expect(result[0].kode_mfd).toBe("3100000");
    });
  });

  describe("listSimdasiRegencyMfds", () => {
    it("should fetch regency MFD codes for a province", async () => {
      const responseData = {
        status: "OK",
        data: [{ page: 1, pages: 1, total: 2 }, [
          { id: "10", kode_mfd: "3171000", nama: "Kota Jakarta Pusat", slug: "kota-jakarta-pusat" },
          { id: "11", kode_mfd: "3172000", nama: "Kota Jakarta Selatan", slug: "kota-jakarta-selatan" },
        ]],
      };
      mockFetch(responseData);

      const result = await client.listSimdasiRegencyMfds("3100000");
      expect(result).toHaveLength(2);
      expect(result[0].nama).toBe("Kota Jakarta Pusat");
    });
  });

  describe("listSimdasiDistrictMfds", () => {
    it("should fetch district MFD codes for a regency", async () => {
      const responseData = {
        status: "OK",
        data: [{ page: 1, pages: 1, total: 2 }, [
          { id: "100", kode_mfd: "3171010", nama: "Tanah Abang", slug: "tanah-abang" },
          { id: "101", kode_mfd: "3171020", nama: "Menteng", slug: "menteng" },
        ]],
      };
      mockFetch(responseData);

      const result = await client.listSimdasiDistrictMfds("3171000");
      expect(result).toHaveLength(2);
      expect(result[0].nama).toBe("Tanah Abang");
    });
  });

  describe("listSimdasiSubjects", () => {
    it("should fetch SIMDASI subjects for an area", async () => {
      const responseData = {
        status: "OK",
        data: [{ page: 1, pages: 1, total: 1 }, [
          {
            id_tabel: "T001",
            judul: "Jumlah Penduduk",
            judul_en: "Total Population",
            kode_tabel: "T001",
            ketersediaan_tahun: [2020, 2021, 2022, 2023],
            bab: "Kependudukan",
            bab_en: "Population",
            subject: "Penduduk",
            subject_en: "Population",
            mms_id: "MMS001",
            mms_subject: "Kependudukan",
            tabel: [1, 2, 3],
          },
        ]],
      };
      mockFetch(responseData);

      const result = await client.listSimdasiSubjects("3100000");
      expect(result).toHaveLength(1);
      expect(result[0].judul).toBe("Jumlah Penduduk");
      expect(result[0].ketersediaan_tahun).toContain(2023);
    });
  });

  describe("listSimdasiMasterTables", () => {
    it("should fetch all SIMDASI master tables", async () => {
      const responseData = {
        status: "OK",
        data: [{ page: 1, pages: 1, total: 1 }, [
          { id_tabel: "T001", judul: "Jumlah Penduduk", judul_en: "Total Population", kode_tabel: "T001", tahun: [2020, 2021] },
        ]],
      };
      mockFetch(responseData);

      const result = await client.listSimdasiMasterTables();
      expect(result).toHaveLength(1);
      expect(result[0].judul_en).toBe("Total Population");
    });
  });

  describe("listSimdasiTablesByArea", () => {
    it("should fetch tables for an area", async () => {
      const responseData = {
        status: "OK",
        data: [{ page: 1, pages: 1, total: 1 }, [
          {
            id_tabel: "T001",
            judul: "Jumlah Penduduk menurut Kecamatan",
            judul_en: "Population by District",
            kode_tabel: "T001",
            ketersediaan_tahun: [2023],
            bab: "Kependudukan",
            bab_en: "Population",
          },
        ]],
      };
      mockFetch(responseData);

      const result = await client.listSimdasiTablesByArea("3100000");
      expect(result).toHaveLength(1);
      expect(result[0].judul).toBe("Jumlah Penduduk menurut Kecamatan");
    });
  });

  describe("listSimdasiTablesByAreaAndSubject", () => {
    it("should fetch tables filtered by area and subject", async () => {
      const responseData = {
        status: "OK",
        data: [{ page: 1, pages: 1, total: 1 }, [
          {
            id_tabel: "T002",
            judul: "Kepadatan Penduduk",
            judul_en: "Population Density",
            kode_tabel: "T002",
            ketersediaan_tahun: [2023],
            bab: "Kependudukan",
            bab_en: "Population",
          },
        ]],
      };
      mockFetch(responseData);

      const result = await client.listSimdasiTablesByAreaAndSubject("3100000", "MMS001");
      expect(result).toHaveLength(1);
      expect(result[0].judul).toBe("Kepadatan Penduduk");
    });
  });

  describe("getSimdasiTableDetail", () => {
    it("should fetch table detail for an area and year", async () => {
      const responseData = {
        data: {
          id_tabel: "T001",
          judul: "Jumlah Penduduk menurut Kecamatan",
          judul_en: "Population by District",
          kode_tabel: "T001",
          tahun: 2023,
          data: [
            { label: "Kecamatan A", nilai: 15000, satuan: "Jiwa" },
            { label: "Kecamatan B", nilai: 22000, satuan: "Jiwa" },
          ],
        },
      };
      mockFetch(responseData);

      const result = await client.getSimdasiTableDetail("3100000", 2023, "T001");
      expect(result.judul).toBe("Jumlah Penduduk menurut Kecamatan");
      expect(result.data).toHaveLength(2);
      expect(result.data[0].nilai).toBe(15000);
    });
  });
});
