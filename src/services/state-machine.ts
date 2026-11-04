/**
 * Zeta Shopping Bot — State Machine
 * Mengatur alur percakapan:
 *
 *   idle → waiting_for_image → searching → waiting_for_product_selection
 *        → waiting_for_filter → waiting_for_quantity → waiting_for_address
 *        → calculating_shipping → calculating_fee → waiting_for_payment_confirmation
 *        → payment_created → waiting_for_payment_proof → checking_out
 *        → completed | failed
 *
 * State disimpan di ElizaOS `State` (bukan Map in-memory) supaya
 * konsisten antar request dan bisa di-reset per percakapan.
 */

import { getStateValue, setStateValue, type CompatibleState } from "../utils/state";

export type ShoppingStep =
  | "idle"
  | "waiting_for_image"
  | "searching"
  | "waiting_for_product_selection"
  | "waiting_for_filter"
  | "waiting_for_quantity"
  | "waiting_for_address"
  | "calculating_shipping"
  | "calculating_fee"
  | "waiting_for_payment_confirmation"
  | "payment_created"
  | "waiting_for_payment_proof"
  | "checking_out"
  | "completed"
  | "failed";

export interface FilterCriteria {
  maxPrice?: number;
  minPrice?: number;
  minRating?: number;
  minSold?: number;
  shopType?: "official" | "all";
}

export interface FeeResult {
  subtotal: number;
  persen: number;
  biaya: number;
  ongkir: number;
  totalBayar: number;
}

export interface PaymentInfo {
  invoiceId: string;
  qrisUrl: string;
  expiredAt: string;
  amount: number;
}

export interface CheckoutResult {
  success: boolean;
  orderNumber?: string;
  shopeeOrderId?: string;
  message: string;
}

export interface UserAddress {
  nama: string;
  hp: string;
  alamat: string;
  kodePos: string;
  kota: string;
}

export interface ShoppingState {
  step: ShoppingStep;
  imageUrl?: string;
  productCandidates?: any[];
  selectedProductIndex?: number;
  filterCriteria?: FilterCriteria;
  jumlah?: number;
  shippingOptions?: any[];
  selectedShippingIndex?: number;
  feeResult?: FeeResult;
  paymentInfo?: PaymentInfo;
  checkoutResult?: CheckoutResult;
  userAddress?: UserAddress;
  errorCount: number;
  lastError?: string;
  startedAt?: string;
  updatedAt?: string;
}

/** Key tempat state shopping disimpan di dalam ElizaOS State */
export const STATE_KEY = "zetaShoppingState";

export const INITIAL_STEP: ShoppingStep = "waiting_for_image";

/**
 * Transisi state yang valid.
 * Key = state sekarang, Value = list state berikutnya yang boleh.
 */
export const STEP_TRANSITIONS: Record<ShoppingStep, ShoppingStep[]> = {
  idle: ["waiting_for_image", "failed"],
  waiting_for_image: ["searching", "failed"],
  searching: ["waiting_for_product_selection", "failed"],
  waiting_for_product_selection: ["waiting_for_filter", "waiting_for_quantity", "failed"],
  waiting_for_filter: ["waiting_for_product_selection", "waiting_for_quantity", "failed"],
  waiting_for_quantity: ["waiting_for_address", "failed"],
  waiting_for_address: ["calculating_shipping", "failed"],
  calculating_shipping: ["waiting_for_product_selection", "calculating_fee", "failed"],
  calculating_fee: ["waiting_for_payment_confirmation", "failed"],
  waiting_for_payment_confirmation: ["payment_created", "failed"],
  payment_created: ["waiting_for_payment_proof", "failed"],
  waiting_for_payment_proof: ["checking_out", "failed"],
  checking_out: ["completed", "failed"],
  completed: ["waiting_for_image", "idle"],
  failed: ["waiting_for_image", "idle"],
};

/** Pesan yang ditampilkan ke user saat transisi tidak valid */
export const STEP_MESSAGES: Record<ShoppingStep, string> = {
  idle: "Kirim foto produk untuk memulai.",
  waiting_for_image: "Kirim foto produk yang ingin dicari di Shopee.",
  searching: "Sedang mencari produk di Shopee...",
  waiting_for_product_selection: "Pilih produk dengan mengetik nomor (1-5).",
  waiting_for_filter: "Tentukan filter harga/rating (contoh: \"maksimal 500rb\").",
  waiting_for_quantity: "Berapa jumlah yang mau dibeli? (contoh: 2)",
  waiting_for_address: "Masukkan alamat lengkap: nama, HP, alamat, kota, kode pos.",
  calculating_shipping: "Sedang menghitung ongkir...",
  calculating_fee: "Sedang menghitung total biaya...",
  waiting_for_payment_confirmation: "Ketik 'oke' atau 'ya' untuk lanjut ke pembayaran.",
  payment_created: "Silakan lakukan pembayaran QRIS.",
  waiting_for_payment_proof: "Kirim bukti pembayaran (screenshot).",
  checking_out: "Sedang melakukan checkout ke Shopee...",
  completed: "Pesanan berhasil! Kirim foto produk baru untuk memulai lagi.",
  failed: "Terjadi kesalahan. Ketik 'ulang' untuk mulai ulang.",
};

export const STEP_DESCRIPTIONS: Record<ShoppingStep, string> = {
  idle: "Siap menerima foto produk",
  waiting_for_image: "Menunggu foto produk",
  searching: "Mencari di Shopee...",
  waiting_for_product_selection: "Menunggu pemilihan produk",
  waiting_for_filter: "Menunggu filter harga/rating",
  waiting_for_quantity: "Menunggu jumlah pembelian",
  waiting_for_address: "Menunggu alamat pengiriman",
  calculating_shipping: "Menghitung ongkir...",
  calculating_fee: "Menghitung total biaya...",
  waiting_for_payment_confirmation: "Menunggu konfirmasi pembayaran",
  payment_created: "Menunggu pembayaran QRIS",
  waiting_for_payment_proof: "Menunggu bukti pembayaran",
  checking_out: "Checkout ke Shopee...",
  completed: "Selesai",
  failed: "Gagal",
};

export const NEXT_ACTIONS: Record<ShoppingStep, string> = {
  idle: "Kirim foto produk",
  waiting_for_image: "Kirim foto produk yang ingin dibeli",
  searching: "Tunggu hasil pencarian",
  waiting_for_product_selection: "Ketik nomor produk (1-5)",
  waiting_for_filter: "Contoh: 'harga max 500rb' atau 'rating 4.5+'",
  waiting_for_quantity: "Ketik jumlah, contoh: '2'",
  waiting_for_address: "Contoh: 'Budi, 08123456789, Jl. Merdeka 1, Jakarta, 12345'",
  calculating_shipping: "Tunggu hitungan ongkir",
  calculating_fee: "Tunggu hitungan biaya",
  waiting_for_payment_confirmation: "Ketik 'oke' atau 'ya' untuk lanjut pembayaran",
  payment_created: "Scan QRIS dan lakukan pembayaran",
  waiting_for_payment_proof: "Kirim bukti transfer",
  checking_out: "Tunggu checkout selesai",
  completed: "Kirim foto produk baru untuk pesan lagi",
  failed: "Ketik 'ulang' untuk memulai ulang",
};

/** Prompt/instructions singkat per step — dipakai provider context */
export const STEP_INSTRUCTIONS: Record<ShoppingStep, string> = {
  idle: "Sapa pengguna dan minta foto produk.",
  waiting_for_image: "Minta pengguna mengirim foto produk. Jangan mengarang harga.",
  searching: "Tunggu proses pencarian selesai.",
  waiting_for_product_selection:
    "Pengguna memilih salah satu dari hasil pencarian. Konfirmasi produk terpilih beserta harga.",
  waiting_for_filter: "Terapkan filter harga/rating yang diminta pengguna.",
  waiting_for_quantity: "Tanyakan jumlah barang yang mau beli.",
  waiting_for_address: "Minta alamat lengkap: nama, nomor HP, alamat, kota, dan kode pos.",
  calculating_shipping: "Menunggu hasil ongkir dari RajaOngkir.",
  calculating_fee: "Menunggu kalkulasi fee bertingkat + ongkir.",
  waiting_for_payment_confirmation:
    "Tampilkan ringkasan total dan minta konfirmasi 'oke' sebelum pembayaran.",
  payment_created: "Tampilkan QRIS dan invoice ID, minta user membayar.",
  waiting_for_payment_proof: "Terima bukti pembayaran lalu lanjut ke checkout Shopee.",
  checking_out: "Playwright sedang checkout. Beri tahu user menunggu.",
  completed: "Sampaikan nomor pesanan dan langkah berikutnya.",
  failed: "Tawarkan untuk mengulang dari awal.",
};

/* -------------------------------------------------------------------------- */
/* State persistence                                                           */
/* -------------------------------------------------------------------------- */

export function createInitialState(): ShoppingState {
  const now = new Date().toISOString();
  return {
    step: INITIAL_STEP,
    errorCount: 0,
    startedAt: now,
    updatedAt: now,
  };
}

/**
 * Baca state shopping dari ElizaOS State.
 * Mengembalikan state default bila belum pernah diinisialisasi.
 */
export async function readShoppingState(
  state: CompatibleState | undefined | null,
): Promise<ShoppingState> {
  const stored = await getStateValue<Partial<ShoppingState>>(state, STATE_KEY);
  if (!stored || typeof stored !== "object") {
    return createInitialState();
  }
  return {
    ...createInitialState(),
    ...stored,
  };
}

/**
 * Simpan (merge) state shopping ke ElizaOS State.
 */
export async function writeShoppingState(
  state: CompatibleState | undefined | null,
  updates: Partial<ShoppingState>,
): Promise<ShoppingState> {
  const current = await readShoppingState(state);
  const next: ShoppingState = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await setStateValue(state, STATE_KEY, next);
  return next;
}

/**
 * Reset state shopping ke awal (step baru + data dibersihkan).
 */
export async function resetShoppingState(
  state: CompatibleState | undefined | null,
): Promise<ShoppingState> {
  const fresh = createInitialState();
  await setStateValue(state, STATE_KEY, fresh);
  return fresh;
}

/* -------------------------------------------------------------------------- */
/* Transitions                                                                 */
/* -------------------------------------------------------------------------- */

export function canTransition(from: ShoppingStep, to: ShoppingStep): boolean {
  if (from === to) return true;
  return (STEP_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Transisi ke step baru. Mengembalikan `{ ok: false, message }` bila tidak valid.
 */
export async function transition(
  state: CompatibleState | undefined | null,
  to: ShoppingStep,
  updates: Partial<ShoppingState> = {},
): Promise<{ ok: boolean; state: ShoppingState; message?: string }> {
  const current = await readShoppingState(state);

  if (!canTransition(current.step, to)) {
    return {
      ok: false,
      state: current,
      message: STEP_MESSAGES[current.step],
    };
  }

  const next = await writeShoppingState(state, { ...updates, step: to });
  return { ok: true, state: next };
}

/**
 * Paksa state ke step tertentu tanpa validasi transisi (untuk recovery / error).
 */
export async function forceStep(
  state: CompatibleState | undefined | null,
  to: ShoppingStep,
  updates: Partial<ShoppingState> = {},
): Promise<ShoppingState> {
  return writeShoppingState(state, { ...updates, step: to });
}

/**
 * Tandai percakapan gagal, simpan pesan error, naikkan errorCount.
 */
export async function markFailed(
  state: CompatibleState | undefined | null,
  error: string,
): Promise<ShoppingState> {
  const current = await readShoppingState(state);
  return writeShoppingState(state, {
    step: "failed",
    lastError: error,
    errorCount: (current.errorCount ?? 0) + 1,
  });
}

/**
 * Cek apakah user boleh lanjut ke step target.
 */
export async function canProceedTo(
  state: CompatibleState | undefined | null,
  target: ShoppingStep,
): Promise<{ valid: boolean; currentStep: ShoppingStep; message?: string }> {
  const current = await readShoppingState(state);
  if (canTransition(current.step, target)) {
    return { valid: true, currentStep: current.step };
  }
  return {
    valid: false,
    currentStep: current.step,
    message: STEP_MESSAGES[current.step],
  };
}

/* -------------------------------------------------------------------------- */
/* Parsers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Parse pilihan produk/kurir dari teks user. Mendukung "2", "pilih 2", "nomor 2".
 */
export function parseSelection(text: string, max: number): number | null {
  const normalized = (text || "").trim().toLowerCase();
  if (!normalized) return null;

  const direct = normalized.match(/^\s*(\d{1,2})\s*$/);
  if (direct) {
    const n = parseInt(direct[1], 10);
    if (n >= 1 && n <= max) return n - 1;
    return null;
  }

  const prefixed = normalized.match(
    /(?:pilih|ambil|no\.?\s*|nomor\s*|opsi\s*|yang\s+|cari\s+)?(\d{1,2})\b/,
  );
  if (prefixed) {
    const n = parseInt(prefixed[1], 10);
    if (n >= 1 && n <= max) return n - 1;
  }

  return null;
}

/**
 * Parse jumlah pembelian dari teks user.
 */
export function parseQuantity(text: string): number | null {
  const normalized = (text || "").trim().toLowerCase();
  if (!normalized) return null;

  const match = normalized.match(/(\d{1,3})\s*(?:pcs|buah|item|biji|unit)?/);
  if (match) {
    const n = parseInt(match[1], 10);
    if (n >= 1 && n <= 99) return n;
  }

  const words: Record<string, number> = {
    satu: 1,
    se: 1,
    dua: 2,
    tiga: 3,
    empat: 4,
    lima: 5,
  };
  for (const [word, value] of Object.entries(words)) {
    if (normalized.includes(word)) return value;
  }

  return null;
}

/**
 * Parse alamat pengiriman dari teks user.
 * Format yang didukung (dipisah koma):
 *   "Budi, 08123456789, Jl. Merdeka 1, Jakarta, 12345"
 */
export function parseAddress(text: string): UserAddress | null {
  const normalized = (text || "").trim();
  if (!normalized) return null;

  const parts = normalized
    .split(/[,;]|\s-\s/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length < 2) return null;

  const kodePosMatch = normalized.match(/\b(\d{5})\b/);
  const kodePos = kodePosMatch ? kodePosMatch[1] : "";
  const hpMatch = normalized.match(
    /(?:\+?62|0)\s?8\d{1,3}[-\s]?\d{3,4}[-\s]?\d{3,4}/,
  );

  const hp = hpMatch
    ? hpMatch[0].replace(/[\s-]/g, "")
    : (parts.find((p) => /^(\+?62|0)\d{8,13}$/.test(p.replace(/\s/g, ""))) ?? "");

  const kota = parts.find((p) =>
    /kota|kabupaten|kecamatan|jakarta|surabaya|bandung|medan|makassar|semarang|yogyakarta/i.test(
      p,
    ),
  );

  const withoutPos = parts.filter(
    (p) =>
      !/^\d{5}$/.test(p) &&
      !/^(\+?62|0)\d{8,13}$/.test(p.replace(/\s/g, "")),
  );

  const nama =
    withoutPos.find(
      (p) => !/^(jl|jln|jl\.|jalan|alamat|no\.|rt|rw|kel|kec|pos)/i.test(p),
    ) ?? "";
  const alamat = withoutPos
    .filter((p) => p !== nama && p !== kota)
    .join(", ");

  if (!kodePos && !hp) return null;

  return {
    nama: nama || "Pelanggan",
    hp,
    alamat: alamat || "-",
    kota: kota || "-",
    kodePos,
  };
}

/**
 * Parse filter criteria (harga / rating) dari teks user.
 */
export function parseFilterCriteria(text: string): FilterCriteria {
  const normalized = (text || "").toLowerCase();
  const criteria: FilterCriteria = { shopType: "all" };

  const toNumber = (raw: string): number => {
    const rbMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*(rb|ribu|juta|jt|k)\b/);
    if (rbMatch) {
      const value = parseFloat(rbMatch[1].replace(",", "."));
      const unit = rbMatch[2];
      if (unit === "jt" || unit === "juta") return value * 1_000_000;
      if (unit === "rb" || unit === "ribu" || unit === "k") return value * 1_000;
      return value;
    }
    const plain = parseFloat(raw.replace(/[.,\s]/g, ""));
    return Number.isFinite(plain) ? plain : 0;
  };

  const under = normalized.match(
    /di bawah\s*(?:rp\.?\s*)?([\d.,]+\s*(?:rb|ribu|juta|jt|k)?)/,
  );
  const range = normalized.match(
    /rp\.?\s*([\d.,]+\s*(?:rb|ribu|juta|jt|k)?)\s*(?:-|sampai|to|s\/d)\s*rp\.?\s*([\d.,]+\s*(?:rb|ribu|juta|jt|k)?)/,
  );
  const max = normalized.match(
    /max(?:imum)?\s*(?:rp\.?\s*)?([\d.,]+\s*(?:rb|ribu|juta|jt|k)?)/,
  );
  const min = normalized.match(
    /min(?:imum)?\s*(?:rp\.?\s*)?([\d.,]+\s*(?:rb|ribu|juta|jt|k)?)/,
  );

  if (under) {
    criteria.maxPrice = toNumber(under[1]);
  } else if (range) {
    criteria.minPrice = toNumber(range[1]);
    criteria.maxPrice = toNumber(range[2]);
  } else if (max) {
    criteria.maxPrice = toNumber(max[1]);
  }

  if (min && !range) {
    criteria.minPrice = toNumber(min[1]);
  }

  const rating = normalized.match(
    /rating\s*(?:min(?:imum)?|minimal|di atas|>\s*)?\s*(\d+(?:[.,]\d+)?)/,
  );
  if (rating) {
    criteria.minRating = parseFloat(rating[1].replace(",", "."));
  }

  const sold = normalized.match(/(?:terjual\s*|sold\s*)(\d+)/);
  if (sold) {
    criteria.minSold = parseInt(sold[1], 10);
  }

  if (/toko resmi|official store|shopee mall/i.test(normalized)) {
    criteria.shopType = "official";
  }

  return criteria;
}

/**
 * Apakah user mengulang dari awal?
 */
export function isRestartIntent(text: string): boolean {
  const normalized = (text || "").trim().toLowerCase();
  return [
    "ulang",
    "ulangi",
    "reset",
    "mulai ulang",
    "cari lagi",
    "ganti produk",
    "batal",
    "stop",
  ].some((kw) => normalized === kw || normalized.startsWith(`${kw} `));
}

/**
 * Apakah user mengonfirmasi pembayaran?
 */
export function isPaymentConfirmation(text: string): boolean {
  const normalized = (text || "").trim().toLowerCase();
  return ["oke", "ok", "ya", "yes", "lanjut", "bayar", "setuju", "gas"].some(
    (kw) => normalized === kw || normalized.startsWith(`${kw} `),
  );
}

/**
 * Filter produk berdasarkan criteria hasil parse.
 */
export function applyFilter(products: any[], criteria: FilterCriteria): any[] {
  return (products ?? []).filter((p) => {
    const harga = Number(p.harga ?? p.price ?? 0);
    const rating = Number(p.rating ?? 0);
    const terjual = Number(p.terjual ?? p.sold ?? 0);

    if (criteria.minPrice !== undefined && harga < criteria.minPrice) return false;
    if (criteria.maxPrice !== undefined && harga > criteria.maxPrice) return false;
    if (criteria.minRating !== undefined && rating < criteria.minRating) return false;
    if (criteria.minSold !== undefined && terjual < criteria.minSold) return false;
    if (criteria.shopType === "official") {
      const toko = String(p.toko ?? p.shop ?? "").toLowerCase();
      const isOfficial =
        toko.includes("official") ||
        toko.includes("official store") ||
        toko.includes("shopee mall");
      if (!isOfficial) return false;
    }

    return true;
  });
}
