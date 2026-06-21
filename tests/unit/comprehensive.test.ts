import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { BpsClient } from "../../src/client/bps-client.js";
import { InMemoryCache } from "../../src/services/cache.js";
import type { IAuthProvider } from "../../src/auth/types.js";
import type { Config } from "../../src/config/index.js";
import { BpsApiError, BpsAuthError, BpsNotFoundError } from "../../src/utils/error.js";

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

function mockFetch(responseData: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(responseData),
  }));
}

function mockFetchError(error: Error) {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
}

describe("SIMDASI — comprehensive", () => {
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

  // --- listSimdasiProvinceMfds ---
  describe("listSimdasiProvinceMfds", () => {
    it("returns provinces", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { id: "1", kode_mfd: "3100000", nama: "DKI Jakarta", slug: "dki-jakarta" },
        { id: "2", kode_mfd: "3500000", nama: "Jawa Timur", slug: "jawa-timur" },
      ]]});
      const r = await client.listSimdasiProvinceMfds();
      expect(r).toHaveLength(2);
      expect(r[0].kode_mfd).toBe("3100000");
    });

    it("returns empty list when no data", async () => {
      mockFetch({ status: "OK", data: [{ page: 1, pages: 0, total: 0 }, []] });
      const r = await client.listSimdasiProvinceMfds();
      expect(r).toEqual([]);
    });

    it("throws BpsAuthError on 401", async () => {
      mockFetch({ error: "Unauthorized" }, 401);
      await expect(client.listSimdasiProvinceMfds()).rejects.toThrow(BpsAuthError);
    });

    it("deduplicates concurrent requests", async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve({ status: "OK", data: [{ page: 1 }, []] }),
      });
      vi.stubGlobal("fetch", fetchFn);
      await Promise.all([
        client.listSimdasiProvinceMfds(),
        client.listSimdasiProvinceMfds(),
        client.listSimdasiProvinceMfds(),
      ]);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  // --- listSimdasiRegencyMfds ---
  describe("listSimdasiRegencyMfds", () => {
    it("requires parent parameter", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { id: "10", kode_mfd: "3171000", nama: "Jakpus", slug: "jakpus" },
      ]]});
      const r = await client.listSimdasiRegencyMfds("3100000");
      expect(r).toHaveLength(1);
    });
  });

  // --- listSimdasiDistrictMfds ---
  describe("listSimdasiDistrictMfds", () => {
    it("returns districts for a regency", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { id: "100", kode_mfd: "3171010", nama: "Tanah Abang", slug: "tanah-abang" },
      ]]});
      const r = await client.listSimdasiDistrictMfds("3171000");
      expect(r[0].nama).toBe("Tanah Abang");
    });
  });

  // --- listSimdasiSubjects ---
  describe("listSimdasiSubjects", () => {
    it("returns subjects with year availability", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { id_tabel: "T001", judul: "Penduduk", judul_en: "Population", kode_tabel: "T001",
          ketersediaan_tahun: [2020, 2021, 2022], bab: "Kependudukan", bab_en: "Population",
          subject: "Penduduk", subject_en: "Population", mms_id: "MMS01", mms_subject: "Demo", tabel: [1] },
      ]]});
      const r = await client.listSimdasiSubjects("3100000");
      expect(r[0].ketersediaan_tahun).toContain(2022);
      expect(r[0].mms_id).toBe("MMS01");
    });

    it("returns empty for unknown wilayah", async () => {
      mockFetch({ status: "OK", data: [{ page: 1, pages: 0, total: 0 }, []] });
      const r = await client.listSimdasiSubjects("0000000");
      expect(r).toEqual([]);
    });
  });

  // --- listSimdasiMasterTables ---
  describe("listSimdasiMasterTables", () => {
    it("returns master tables", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { id_tabel: "MT01", judul: "Master Tabel 1", judul_en: "Master Table 1", kode_tabel: "MT01", tahun: [2023] },
      ]]});
      const r = await client.listSimdasiMasterTables();
      expect(r[0].judul_en).toBe("Master Table 1");
    });
  });

  // --- listSimdasiTablesByArea ---
  describe("listSimdasiTablesByArea", () => {
    it("returns tables for area", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { id_tabel: "T001", judul: "Jumlah Penduduk", judul_en: "Total Population",
          kode_tabel: "T001", ketersediaan_tahun: [2023], bab: "Kependudukan", bab_en: "Population" },
      ]]});
      const r = await client.listSimdasiTablesByArea("3100000");
      expect(r[0].ketersediaan_tahun).toEqual([2023]);
    });
  });

  // --- listSimdasiTablesByAreaAndSubject ---
  describe("listSimdasiTablesByAreaAndSubject", () => {
    it("filters by area and subject", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { id_tabel: "T002", judul: "Kepadatan", judul_en: "Density",
          kode_tabel: "T002", ketersediaan_tahun: [2023], bab: "Kependudukan", bab_en: "Population" },
      ]]});
      const r = await client.listSimdasiTablesByAreaAndSubject("3100000", "MMS01");
      expect(r[0].judul).toBe("Kepadatan");
    });
  });

  // --- getSimdasiTableDetail ---
  describe("getSimdasiTableDetail", () => {
    it("returns structured data rows", async () => {
      mockFetch({ data: {
        id_tabel: "T001", judul: "Penduduk per Kecamatan", judul_en: "Population by District",
        kode_tabel: "T001", tahun: 2023,
        data: [
          { label: "Kec A", nilai: 15000, satuan: "Jiwa" },
          { label: "Kec B", nilai: 22000, satuan: "Jiwa" },
        ],
      }});
      const r = await client.getSimdasiTableDetail("3100000", 2023, "T001");
      expect(r.data).toHaveLength(2);
      expect(r.data[0].nilai).toBe(15000);
      expect(r.data[1].satuan).toBe("Jiwa");
    });

    it("handles null values", async () => {
      mockFetch({ data: {
        id_tabel: "T001", judul: "Test", judul_en: "Test",
        kode_tabel: "T001", tahun: 2023,
        data: [{ label: "Kec A", nilai: null, satuan: "Jiwa" }],
      }});
      const r = await client.getSimdasiTableDetail("3100000", 2023, "T001");
      expect(r.data[0].nilai).toBeNull();
    });

    it("throws on invalid table ID", async () => {
      mockFetch({ status: "400", "data-availability": "list-not-available" }, 200);
      await expect(client.getSimdasiTableDetail("3100000", 2023, "INVALID"))
        .rejects.toThrow(BpsNotFoundError);
    });
  });
});

describe("SDGs — comprehensive", () => {
  let auth: IAuthProvider;
  let cache: InMemoryCache;
  let client: BpsClient;

  beforeEach(() => {
    auth = createMockAuth();
    cache = new InMemoryCache(100);
    client = new BpsClient(auth, cache, createConfig());
  });

  afterEach(() => { vi.restoreAllMocks(); });

  describe("listSdgs", () => {
    it("lists all indicators", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { var_id: 1804, goal_id: 1, title: "No Poverty Indicator", unit: "Orang" },
        { var_id: 1805, goal_id: 2, title: "Zero Hunger", unit: "Persen" },
      ]]});
      const r = await client.listSdgs();
      expect(r.data).toHaveLength(2);
    });

    it("filters by goal", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { var_id: 1804, goal_id: 1, title: "Goal 1 Only", unit: "Orang" },
      ]]});
      const r = await client.listSdgs(1);
      expect(r.data).toHaveLength(1);
      expect(r.data[0].goal_id).toBe(1);
    });

    it("returns empty for invalid goal", async () => {
      mockFetch({ status: "OK", data: [{ page: 1, pages: 0, total: 0 }, []] });
      const r = await client.listSdgs(99);
      expect(r.data).toEqual([]);
    });

    it("handles indicators without unit", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { var_id: 1806, goal_id: 3, title: "Good Health" },
      ]]});
      const r = await client.listSdgs();
      expect(r.data[0].unit).toBeUndefined();
    });
  });

  describe("getDynamicData for SDGs", () => {
    it("returns numeric values", async () => {
      mockFetch({
        status: "OK", "data-availability": "available",
        var: [{ val: 1804, label: "Test", unit: "Orang" }],
        tahun: [{ val: 119, label: "2023" }],
        vervar: [{ kode_vervar: 9999, label_vervar: "INDONESIA", group_vervar: 0, name_group_vervar: "" }],
        datacontent: { "9999180401190": 1250 },
      });
      const r = await client.getDynamicData("0000", "1804");
      expect(r.datacontent!["9999180401190"]).toBe(1250);
    });

    it("returns empty datacontent for no data", async () => {
      mockFetch({
        status: "OK", "data-availability": "available",
        var: [{ val: 1805, label: "Empty" }],
        tahun: [], vervar: [],
        datacontent: {},
      });
      const r = await client.getDynamicData("0000", "1805");
      expect(Object.keys(r.datacontent!)).toHaveLength(0);
    });
  });
});

describe("SDDS — comprehensive", () => {
  let auth: IAuthProvider;
  let cache: InMemoryCache;
  let client: BpsClient;

  beforeEach(() => {
    auth = createMockAuth();
    cache = new InMemoryCache(100);
    client = new BpsClient(auth, cache, createConfig());
  });

  afterEach(() => { vi.restoreAllMocks(); });

  describe("listSdds", () => {
    it("returns indicators with model type", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { var_id: 1753, title: "Export Value", model: "data", unit: "US$" },
        { var_id: 1754, title: "Import Table", model: "statictable" },
      ]]});
      const r = await client.listSdds();
      expect(r.data[0].model).toBe("data");
      expect(r.data[1].model).toBe("statictable");
    });

    it("handles data model indicators", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { var_id: 1753, title: "Export", model: "data", sub_id: 1, sub_name: "Trade" },
      ]]});
      const r = await client.listSdds();
      expect(r.data[0].sub_name).toBe("Trade");
    });
  });
});

describe("Statistical Classifications — comprehensive", () => {
  let auth: IAuthProvider;
  let cache: InMemoryCache;
  let client: BpsClient;

  beforeEach(() => {
    auth = createMockAuth();
    cache = new InMemoryCache(100);
    client = new BpsClient(auth, cache, createConfig());
  });

  afterEach(() => { vi.restoreAllMocks(); });

  describe("listClassifications", () => {
    it("lists KBLI 2020 entries", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { id: "kbli_2020_01", kode: "01", judul: "Pertanian", level: "kategori" },
      ]]});
      const r = await client.listClassifications("kbli2020");
      expect(r.data[0].kode).toBe("01");
    });

    it("lists KBKI entries", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { id: "kbki_2015_01", kode: "01", judul: "Produk Pertanian", level: "seksi" },
      ]]});
      const r = await client.listClassifications("kbki2015");
      expect(r.data[0].level).toBe("seksi");
    });

    it("filters by level", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { id: "kbli_2020_011", kode: "011", judul: "Jagung", level: "golongan" },
      ]]});
      const r = await client.listClassifications("kbli2020", "golongan");
      expect(r.data).toHaveLength(1);
    });
  });

  describe("getClassificationDetail", () => {
    it("returns full detail with derived entries", async () => {
      mockFetch({ data: {
        id: "kbli_2020_01", kode: "01", judul: "Pertanian",
        deskripsi: "Agriculture sector", level: "kategori",
        sebelumnya: ["A"],
        turunan: [{ kode: "011", judul: "Tanaman Jagung", title: "Corn" }],
        url: "https://example.com", tags: ["pertanian"],
      }});
      const r = await client.getClassificationDetail("kbli2020", "kbli_2020_01");
      expect(r.turunan).toHaveLength(1);
      expect(r.sebelumnya).toEqual(["A"]);
      expect(r.tags).toContain("pertanian");
    });

    it("handles missing optional fields", async () => {
      mockFetch({ data: {
        id: "kbli_2020_02", kode: "02", judul: "Kehutanan",
        deskripsi: "", level: "kategori",
      }});
      const r = await client.getClassificationDetail("kbli2020", "kbli_2020_02");
      expect(r.turunan).toBeUndefined();
      expect(r.sebelumnya).toBeUndefined();
    });
  });
});

describe("Census Extended — comprehensive", () => {
  let auth: IAuthProvider;
  let cache: InMemoryCache;
  let client: BpsClient;

  beforeEach(() => {
    auth = createMockAuth();
    cache = new InMemoryCache(100);
    client = new BpsClient(auth, cache, createConfig());
  });

  afterEach(() => { vi.restoreAllMocks(); });

  describe("listCensusAreas", () => {
    it("returns areas with MFD codes", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { id: "1", kode_mfd: "3100000", nama: "DKI Jakarta", slug: "dki-jakarta" },
      ]]});
      const r = await client.listCensusAreas("sp2020");
      expect(r[0].slug).toBe("dki-jakarta");
    });
  });

  describe("listCensusDatasets", () => {
    it("returns datasets for topic", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { id: "DS001", id_topik: 1, topic: "Population", id_kegiatan: "sp2020",
          nama: "Pop by Age", deskripsi: "Population by age group" },
      ]]});
      const r = await client.listCensusDatasets("sp2020", 1);
      expect(r[0].deskripsi).toBeTruthy();
    });
  });

  describe("getCensusData", () => {
    it("returns records with indicators and categories", async () => {
      mockFetch({ data: [
        { id_wilayah: "1", kode_wilayah: "3100000", nama_wilayah: "Jakarta",
          level_wilayah: "provinsi", id_indikator: "I01", nama_indikator: "Population",
          kategori_1: "Male", kategori_2: "15-24", period: "2020", nilai: 1000000 },
        { id_wilayah: "1", kode_wilayah: "3100000", nama_wilayah: "Jakarta",
          id_indikator: "I01", nama_indikator: "Population",
          kategori_1: "Female", period: "2020", nilai: 950000 },
      ]});
      const r = await client.getCensusData("sp2020", "3100000", "DS001");
      expect(r).toHaveLength(2);
      expect(r[0].kategori_1).toBe("Male");
      expect(r[1].kategori_1).toBe("Female");
    });

    it("handles null nilai", async () => {
      mockFetch({ data: [
        { id_wilayah: "1", kode_wilayah: "3100000", nama_wilayah: "Jakarta",
          id_indikator: "I01", nama_indikator: "Confidential", period: "2020", nilai: null },
      ]});
      const r = await client.getCensusData("sp2020", "3100000", "DS001");
      expect(r[0].nilai).toBeNull();
    });

    it("up to 4 category levels", async () => {
      mockFetch({ data: [
        { id_wilayah: "1", kode_wilayah: "3100000", nama_wilayah: "Jakarta",
          id_indikator: "I01", nama_indikator: "Detailed",
          kategori_1: "A", kategori_2: "B", kategori_3: "C", kategori_4: "D",
          period: "2020", nilai: 500 },
      ]});
      const r = await client.getCensusData("sp2020", "3100000", "DS001");
      expect(r[0].kategori_4).toBe("D");
    });
  });
});

describe("News Categories — comprehensive", () => {
  let auth: IAuthProvider;
  let cache: InMemoryCache;
  let client: BpsClient;

  beforeEach(() => {
    auth = createMockAuth();
    cache = new InMemoryCache(100);
    client = new BpsClient(auth, cache, createConfig());
  });

  afterEach(() => { vi.restoreAllMocks(); });

  describe("listNewsCategories", () => {
    it("returns news categories", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { newscat_id: 1, newscat_name: "Sensus dan Survey" },
        { newscat_id: 2, newscat_name: "Statistik Lain" },
      ]]});
      const r = await client.listNewsCategories("0000");
      expect(r).toHaveLength(2);
    });

    it("returns single category", async () => {
      mockFetch({ status: "OK", data: [{ page: 1 }, [
        { newscat_id: 3, newscat_name: "Kegiatan Statistik" },
      ]]});
      const r = await client.listNewsCategories("3500");
      expect(r[0].newscat_name).toBe("Kegiatan Statistik");
    });
  });
});

describe("Glossary Detail — comprehensive", () => {
  let auth: IAuthProvider;
  let cache: InMemoryCache;
  let client: BpsClient;

  beforeEach(() => {
    auth = createMockAuth();
    cache = new InMemoryCache(100);
    client = new BpsClient(auth, cache, createConfig());
  });

  afterEach(() => { vi.restoreAllMocks(); });

  describe("getGlossaryDetail", () => {
    it("returns full term definition", async () => {
      mockFetch({ data: {
        _id: "term001",
        _source: {
          definisi: "Persentase penduduk miskin",
          satuan: "Persen",
          sumberData: "Susenas",
          sumberKonten: "BPS",
          judulIndikator: "Angka Kemiskinan",
          konsep: "Kemiskinan",
          ukuran: "Makro",
          endpoint: "api/data",
        },
      }});
      const r = await client.getGlossaryDetail("term001");
      expect(r._source.judulIndikator).toBe("Angka Kemiskinan");
      expect(r._source.ukuran).toBe("Makro");
      expect(r._source.endpoint).toBe("api/data");
    });

    it("handles minimal response", async () => {
      mockFetch({ data: {
        _id: "term002",
        _source: { definisi: "Definisi singkat", satuan: "-", sumberData: "", konsep: "" },
      }});
      const r = await client.getGlossaryDetail("term002");
      expect(r._source.definisi).toBe("Definisi singkat");
    });

    it("throws on missing term", async () => {
      mockFetch({ status: "400", "data-availability": "list-not-available" }, 200);
      await expect(client.getGlossaryDetail("nonexistent"))
        .rejects.toThrow(BpsNotFoundError);
    });
  });
});
