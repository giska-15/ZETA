/**
 * Zeta Shipping Calculator Service
 * Menghitung ongkos kirim menggunakan RajaOngkir API
 * 
 * Endpoint: POST https://api.rajaongkir.com/starter/cost (Starter)
 *           POST https://pro.rajaongkir.com/api/cost (Pro)
 */

export interface ShippingCostResult {
  nama: string;
  harga: number;
  estimasi: string;
  service: string;
}

export interface RajaOngkirConfig {
  apiKey: string;
  originCityId: number;
  isPro: boolean;
}

/**
 * Load shipping configuration from environment
 */
function loadShippingConfig(): RajaOngkirConfig {
  const apiKey = process.env.RAJAONGKIR_API_KEY;
  const originCityId = parseInt(
    process.env.RAJAONGKIR_ORIGIN_CITY_ID ?? "501",
    10
  );
  const isPro = process.env.RAJAONGKIR_IS_PRO === "true";
  
  if (!apiKey) {
    throw new Error("RAJAONGKIR_API_KEY is required");
  }
  
  return {
    apiKey,
    originCityId,
    isPro,
  };
}

/**
 * Sleep for specified milliseconds with exponential backoff
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate shipping cost with retry logic (3x exponential backoff)
 * 
 * @param destinationCityId - ID kota tujuan dari RajaOngkir
 * @param weightGram - Berat barang dalam gram
 * @param courier - Kode kurir (jne, tiki, pos, dll) atau 'all' untuk semua
 * @returns Array of shipping options sorted by price (termurah first)
 */
export async function hitungOngkir(
  destinationCityId: number,
  weightGram: number,
  courier: string = "all"
): Promise<ShippingCostResult[]> {
  const config = loadShippingConfig();
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  const baseUrl = config.isPro 
    ? "https://pro.rajaongkir.com/api/cost"
    : "https://api.rajaongkir.com/starter/cost";
  
  const couriers = courier === "all" 
    ? ["jne", "tiki", "pos"] 
    : [courier.toLowerCase()];
  
  const allResults: ShippingCostResult[] = [];
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      for (const kurir of couriers) {
        const response = await fetch(baseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "key": config.apiKey,
          },
          body: new URLSearchParams({
            origin: config.originCityId.toString(),
            destination: destinationCityId.toString(),
            weight: weightGram.toString(),
            courier: kurir,
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`RajaOngkir error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        
        if (data.rajaongkir?.results) {
          for (const result of data.rajaongkir.results) {
            if (result.costs) {
              for (const cost of result.costs) {
                for (const detail of cost.service === cost.service 
                  ? (Array.isArray(cost.cost) ? cost.cost : [cost.cost]) 
                  : (cost.cost || [])) {
                  allResults.push({
                    nama: result.code?.toUpperCase() || kurir.toUpperCase(),
                    harga: detail.value || 0,
                    estimasi: detail.etd || "-",
                    service: cost.service || detail.service || "-",
                  });
                }
              }
            }
          }
        }
      }
      
      // Success - sort by price ascending
      allResults.sort((a, b) => a.harga - b.harga);
      return allResults;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Exponential backoff: 1s, 2s, 4s
      const delayMs = Math.pow(2, attempt - 1) * 1000;
      console.warn(
        `Shipping calculation attempt ${attempt} failed: ${lastError.message}. ` +
        `Retrying in ${delayMs}ms...`
      );
      
      if (attempt < maxRetries) {
        await sleep(delayMs);
      }
    }
  }
  
  // All retries failed
  throw new Error(
    `Failed to calculate shipping after ${maxRetries} attempts: ${lastError?.message}`
  );
}

/**
 * Get city ID by name (useful for user input)
 * 
 * @param cityName - Nama kota yang dicari
 * @returns Array of matching cities
 */
export async function cariKota(cityName: string): Promise<
  Array<{ city_id: string; city_name: string; province: string }>
> {
  const config = loadShippingConfig();
  
  const baseUrl = config.isPro
    ? "https://pro.rajaongkir.com/api/city"
    : "https://api.rajaongkir.com/starter/city";
  
  const response = await fetch(`${baseUrl}?city=${encodeURIComponent(cityName)}`, {
    headers: {
      "key": config.apiKey,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to search city: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.rajaongkir?.results) {
    return [];
  }
  
  return data.rajaongkir.results.map((r: { city_id: string; city_name: string; province: string }) => ({
    city_id: r.city_id,
    city_name: r.city_name,
    province: r.province,
  }));
}

export default hitungOngkir;
