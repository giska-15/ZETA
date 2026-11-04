/**
 * Zeta Visual Search Service
 * Mencari produk dari foto menggunakan Apify Google Lens Scraper
 */

export interface ProductCandidate {
  nama: string;
  harga: number;
  gambar_url: string;
  url_shopee: string;
  toko: string;
  rating: number;
}

function loadApifyConfig() {
  return {
    token: process.env.APIFY_TOKEN,
  };
}

/**
 * Search produk dari foto menggunakan Apify Google Lens Scraper
 */
async function searchWithApify(imageBuffer: Buffer): Promise<ProductCandidate[]> {
  const config = loadApifyConfig();
  
  if (!config.token) {
    throw new Error("APIFY_TOKEN not configured");
  }

  // Convert image to base64 untuk upload
  const base64Image = imageBuffer.toString("base64");
  
  // Upload image ke Apify
  const uploadResponse = await fetch("https://api.apify.com/v2/files", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: base64Image,
      name: "product-image.jpg",
      mimeType: "image/jpeg",
    }),
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload image: ${uploadResponse.status}`);
  }

  const uploadData = await uploadResponse.json();
  const fileUrl = uploadData.url;

  // Run Google Lens actor
  const actorResponse = await fetch("https://api.apify.com/v2/acts/apify~google-lens-scraper/run-sync", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: fileUrl,
      countryCode: "id",
      languageCode: "id",
    }),
  });

  if (!actorResponse.ok) {
    throw new Error(`Apify actor failed: ${actorResponse.status}`);
  }

  const actorData = await actorResponse.json();
  const results = actorData.datasetItems || [];

  const candidates: ProductCandidate[] = [];

  for (const item of results) {
    // Apify Google Lens returns similar products
    const title = item.title || item.name || "Produk";
    const priceText = item.price || "0";
    const price = parseInt(priceText.toString().replace(/[^0-9]/g, ""), 10) || 0;
    const imageUrl = item.imageUrl || item.image || "";
    const productUrl = item.url || item.productUrl || "";
    const storeName = item.source || item.merchant || "Toko";
    const ratingValue = item.rating || item.score || 0;

    // Convert to Shopee URL jika bukan Shopee
    let shopeeUrl = productUrl;
    if (!productUrl.includes("shopee")) {
      const searchQuery = encodeURIComponent(title.split(" ")[0]);
      shopeeUrl = `https://shopee.co.id/search?keyword=${searchQuery}`;
    }

    candidates.push({
      nama: title,
      harga: price,
      gambar_url: imageUrl,
      url_shopee: shopeeUrl,
      toko: storeName,
      rating: typeof ratingValue === "number" ? ratingValue : 0,
    });
  }

  return candidates;
}

/**
 * Main function: Search produk dari foto menggunakan Apify Google Lens
 * 
 * @param imageBuffer - Buffer gambar yang dikirim user
 * @returns Array produk kandidat dari Shopee
 */
export async function searchProdukDariFoto(imageBuffer: Buffer): Promise<ProductCandidate[]> {
  console.log("[Vision] Starting product search from image...");
  
  try {
    const apifyResults = await searchWithApify(imageBuffer);
    if (apifyResults.length > 0) {
      console.log(`[Vision] Found ${apifyResults.length} products via Apify`);
      return apifyResults;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Vision] Apify search failed: ${message}`);
  }

  // Failed - return empty array (bot will handle gracefully)
  console.error("[Vision] Visual search failed");
  return [];
}

export default searchProdukDariFoto;
