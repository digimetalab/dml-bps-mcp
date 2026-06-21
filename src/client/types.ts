

export interface PageInfo {
  page: number;
  pages: number;
  total: number;
  per_page: number;
  count: number;
}

/** Domain/Region */
export interface BpsDomain {
  domain_id: string;
  domain_name: string;
  domain_url: string;
}

/** Subject */
export interface BpsSubject {
  sub_id: number;
  title: string;
  subcat_id?: number;
  subcat?: string;
  ntabel?: number;
  nvar?: number;
}

/** Subject Category */
export interface BpsSubjectCategory {
  subcat_id: number;
  title: string;
}

/** Variable */
export interface BpsVariable {
  var_id: number;
  title: string;
  sub_id: number;
  sub_name: string;
  def?: string;
  notes?: string;
  unit?: string;
  graph_id?: number;
  graph_name?: string;
}

/** Vertical Variable */
export interface BpsVerticalVariable {
  kode_vervar: number;
  label_vervar: string;
  group_vervar: number;
  name_group_vervar: string;
}

/** Derived Variable */
export interface BpsDerivedVariable {
  kode_turvar: number;
  label_turvar: string;
  group_turvar: number;
  name_group_turvar: string;
}

/** Period */
export interface BpsPeriod {
  th_id: number;
  th_name: string;
  val: number;
}

/** Derived Period */
export interface BpsDerivedPeriod {
  turth_id: number;
  turth_name: string;
}

/** Unit */
export interface BpsUnit {
  unit_id: number;
  unit: string;
}

/** Dynamic data response */
export interface BpsDynamicDataResponse {
  status: string;
  "data-availability": string;
  data: unknown; // varies by endpoint
  datacontent?: Record<string, number | string>;
  vervar?: BpsVerticalVariable[];
  turvar?: BpsDerivedVariable[];
  tahun?: BpsPeriod[];
  turtahun?: BpsDerivedPeriod[];
  var?: BpsVariable[];
  labelvervar?: string;
  turvar_label?: string;
  message?: string;
}

/** Static Table */
export interface BpsStaticTable {
  table_id: number;
  title: string;
  subj_id: number;
  subj?: string;
  updt_date: string;
  size: string;
  excel?: string;
}

/** Static Table Detail */
export interface BpsStaticTableDetail {
  table_id: number;
  title: string;
  subj_id: number;
  subj?: string;
  table: string; // HTML table content
  updt_date: string;
  size: string;
  excel?: string;
}

/** Press Release */
export interface BpsPressRelease {
  brs_id: number;
  title: string;
  subj_id: number;
  subj?: string;
  rl_date: string;
  abstract?: string;
  pdf?: string;
  size?: string;
}

/** Publication */
export interface BpsPublication {
  pub_id: string;
  title: string;
  issn?: string;
  sch_date: string;
  rl_date: string;
  abstract?: string;
  cover?: string;
  pdf?: string;
  size?: string;
}

/** Strategic Indicator */
export interface BpsStrategicIndicator {
  indicator_id: number;
  title: string;
  sub_id: number;
  sub_name: string;
  data?: Record<string, number | string>;
}



/** Infographic */
export interface BpsInfographic {
  inf_id: number;
  title: string;
  img: string;
  date: string;
  desc: string;
  category: number;
  dl: string;
}

/** Infographic Detail */
export interface BpsInfographicDetail extends BpsInfographic {
  related?: Array<{
    id: number;
    title: string;
    img: string;
  }>;
}

/** News */
export interface BpsNews {
  news_id: number;
  newscat_id: string;
  newscat_name: string;
  title: string;
  news: string;
  rl_date: string;
  picture: string;
}

/** News Detail */
export interface BpsNewsDetail {
  news_id: number;
  news_type: string;
  newscat_name: string;
  title: string;
  news: string;
  rl_date: string;
  picture: string;
  related?: Array<{
    id: number;
    title: string;
  }>;
}

/** Glossary Term (glosarium) */
export interface BpsGlossaryTerm {
  _id: string;
  _source: {
    sync_date: string;
    definisi: string;
    ukuran: string;
    sumberKonten: string;
    sumberData: string;
    namaKlasifikasi: string;
    judulIndikator: string;
    konsep: string;
    endpoint: string;
    satuan: string;
    jenis: string;
    id: string;
    flag: boolean;
  };
}

/** CSA Subject Category */
export interface BpsCsaSubjectCategory {
  subcat_id: number;
  title: string;
}

/** CSA Subject */
export interface BpsCsaSubject {
  sub_id: number;
  title: string;
  subcat_id: number;
  subcat: string;
  ntabel: number;
  desc: string;
  icon: string;
}

/** CSA Table (tablestatistic) */
export interface BpsCsaTable {
  id: string;
  title: string;
  oldest_period: string | null;
  latest_period: string | null;
  id_subject: number;
  subject: string;
  id_subcat: number;
  subcat: string;
  tablesource: string;
  last_update: string;
}

/** CSA Table Detail */
export interface BpsCsaTableDetail {
  table_id: number;
  sub_id: number;
  subcsa_id: number;
  subcsa: string;
  title: string;
  table: string;
  cr_date: string;
  updt_date: string;
  excel?: string;
  size: string;
}

/** Census Event */
export interface BpsCensusEvent {
  id: string;
  kegiatan: string;
  tahun_kegiatan: number;
}

/** SIMDASI Area (MFD Code) */
export interface BpsSimdasiArea {
  id: string;
  kode_mfd: string;
  nama: string;
  slug: string;
}

/** SIMDASI Subject */
export interface BpsSimdasiSubject {
  id_tabel: string;
  judul: string;
  judul_en: string;
  kode_tabel: string;
  ketersediaan_tahun: number[];
  bab: string;
  bab_en: string;
  subject: string;
  subject_en: string;
  mms_id: string;
  mms_subject: string;
  tabel: number[];
}

/** SIMDASI Master Table */
export interface BpsSimdasiMasterTable {
  id_tabel: string;
  judul: string;
  judul_en: string;
  kode_tabel: string;
  tahun: number[];
}

/** SIMDASI Table */
export interface BpsSimdasiTable {
  id_tabel: string;
  judul: string;
  judul_en: string;
  kode_tabel: string;
  ketersediaan_tahun: number[];
  bab: string;
  bab_en: string;
}

/** SIMDASI Table Detail */
export interface BpsSimdasiTableDetail {
  id_tabel: string;
  judul: string;
  judul_en: string;
  kode_tabel: string;
  tahun: number;
  data: Array<{
    label: string;
    nilai: number | string | null;
    satuan?: string;
  }>;
}

/** SDGs Goal */
export interface BpsSdgsGoal {
  goal_id: number;
  goal_name: string;
  goal_name_en: string;
  goal_icon: string;
}

/** SDGs Variable/Indicator */
export interface BpsSdgsVariable {
  var_id: number;
  goal_id: number;
  title: string;
  title_en?: string;
  sub_id?: number;
  sub_name?: string;
  unit?: string;
}

/** SDDS Variable/Indicator */
export interface BpsSddsVariable {
  var_id: number;
  title: string;
  title_en?: string;
  model: "data" | "statictable";
  sub_id?: number;
  sub_name?: string;
  unit?: string;
}

/** Statistical Classification Entry (KBLI/KBKI list) */
export interface BpsClassificationEntry {
  id: string;
  kode: string;
  judul: string;
  title?: string;
  level?: string;
  url?: string;
}

/** Statistical Classification Detail */
export interface BpsClassificationDetail {
  id: string;
  kode: string;
  judul: string;
  title?: string;
  deskripsi: string;
  description?: string;
  level: string;
  sebelumnya?: string[];
  turunan?: Array<{ kode: string; judul: string; title?: string }>;
  url?: string;
  tags?: string[];
}

/** Census Topic */
export interface BpsCensusTopic {
  id: number;
  topik: string;
  topic: string;
  id_kegiatan: string;
  kegiatan: string;
}

/** Census Event Area */
export interface BpsCensusArea {
  id: string;
  kode_mfd: string;
  nama: string;
  slug: string;
}

/** Census Dataset */
export interface BpsCensusDataset {
  id: string;
  id_topik: number;
  topic: string;
  id_kegiatan: string;
  nama: string;
  deskripsi: string;
}

/** Census Data Record */
export interface BpsCensusDataRecord {
  id_wilayah: string;
  kode_wilayah: string;
  nama_wilayah: string;
  level_wilayah?: string;
  id_indikator: string;
  nama_indikator: string;
  kategori_1?: string;
  kategori_2?: string;
  kategori_3?: string;
  kategori_4?: string;
  period: string;
  nilai: number | string | null;
}
