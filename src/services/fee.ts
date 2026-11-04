/**
 * Zeta Fee Calculator Service
 * Menghitung biaya layanan bertingkat berdasarkan subtotal transaksi.
 * 
 * Aturan:
 * - subtotal < 1000 → throw Error("Minimum transaksi Rp1.000")
 * - subtotal < 50000 → 2%
 * - subtotal < 500000 → 1.5%
 * - subtotal < 1000000 → 1%
 * - subtotal >= 1000000 → 0.75%
 */

export interface FeeCalculationResult {
  subtotal: number;
  persen: number;
  biaya: number;
  total: number;
}

export interface FeeConfig {
  TIER_1_MAX: number;
  TIER_1_PCT: number;
  TIER_2_MAX: number;
  TIER_2_PCT: number;
  TIER_3_MAX: number;
  TIER_3_PCT: number;
  TIER_4_PCT: number;
}

/**
 * Load fee configuration from environment variables
 * TIER_X_MAX represents the UPPER boundary (exclusive) for that tier
 */
function loadFeeConfig(): FeeConfig {
  return {
    // Tier 1: 0 to < 50000 = 2%
    TIER_1_MAX: parseInt(process.env.FEE_TIER_1_MAX ?? "50000", 10),
    TIER_1_PCT: parseFloat(process.env.FEE_TIER_1_PCT ?? "2"),
    // Tier 2: 50000 to < 500000 = 1.5%
    TIER_2_MAX: parseInt(process.env.FEE_TIER_2_MAX ?? "500000", 10),
    TIER_2_PCT: parseFloat(process.env.FEE_TIER_2_PCT ?? "1.5"),
    // Tier 3: 500000 to < 1000000 = 1%
    TIER_3_MAX: parseInt(process.env.FEE_TIER_3_MAX ?? "1000000", 10),
    TIER_3_PCT: parseFloat(process.env.FEE_TIER_3_PCT ?? "1"),
    // Tier 4: >= 1000000 = 0.75%
    TIER_4_PCT: parseFloat(process.env.FEE_TIER_4_PCT ?? "0.75"),
  };
}

/**
 * Hitung biaya layanan berdasarkan subtotal transaksi.
 * 
 * @param subtotal - Jumlah subtotal produk (BUKAN termasuk ongkir)
 * @returns Object berisi subtotal, persen fee, biaya layanan, dan total
 * @throws Error jika subtotal kurang dari Rp1.000
 */
export function hitungBiayaLayanan(subtotal: number): FeeCalculationResult {
  const config = loadFeeConfig();
  
  // Validasi minimum
  if (subtotal < 1000) {
    throw new Error("Minimum transaksi Rp1.000");
  }

  // Tentukan persentase fee berdasarkan tier
  let persen: number;
  
  if (subtotal < config.TIER_1_MAX) {
    // Tier 1: < 50rb = 2%
    persen = config.TIER_1_PCT;
  } else if (subtotal < config.TIER_2_MAX) {
    // Tier 2: 50rb - 500rb = 1.5%
    persen = config.TIER_2_PCT;
  } else if (subtotal < config.TIER_3_MAX) {
    // Tier 3: 500rb - 1jt = 1%
    persen = config.TIER_3_PCT;
  } else {
    // Tier 4: >= 1jt = 0.75%
    persen = config.TIER_4_PCT;
  }

  // Hitung biaya (pembulatan)
  const biaya = Math.round(subtotal * (persen / 100));
  const total = subtotal + biaya;

  return {
    subtotal,
    persen,
    biaya,
    total,
  };
}

/**
 * Hitung total lengkap including ongkir
 * 
 * @param subtotal - Jumlah subtotal produk
 * @param ongkir - Biaya pengiriman
 * @returns Object lengkap dengan breakdown
 */
export function hitungTotalLengkap(
  subtotal: number, 
  ongkir: number
): FeeCalculationResult & { ongkir: number } {
  const feeResult = hitungBiayaLayanan(subtotal);
  
  return {
    ...feeResult,
    ongkir,
    total: feeResult.subtotal + feeResult.biaya + ongkir,
  };
}

export default hitungBiayaLayanan;
