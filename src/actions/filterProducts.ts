/**
 * Action: Filter Products
 * Memfilter produk berdasarkan harga, rating, atau kriteria lain
 */

import { type Action, type IAgentRuntime, type Memory, type State, type ActionResult } from "@elizaos/core";
import { getStateValue, setStateValue } from "../utils/state";

interface ProductCandidate {
  nama: string;
  harga: number;
  gambar_url: string;
  url_shopee: string;
  toko: string;
  rating: number;
}

export const filterProducts: Action = {
  name: "FILTER_PRODUCTS",
  description: "Memfilter produk berdasarkan budget, rating minimum, atau kriteria lain",
  
  validate: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<boolean> => {
    const text = (message.content.text || "").toLowerCase();
    const hasProducts = await getStateValue(state, "productCandidates");

    const priceKeywords = ["budget", "mahal", "murah", "harga", "range", "di bawah", "di atas", "max", "min", "ranting"];
    const hasPriceKeyword = priceKeywords.some(kw => text.includes(kw));

    return !!hasProducts && hasPriceKeyword;
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ActionResult | void> => {
    console.log("[Action] FILTER_PRODUCTS triggered");
    
    try {
      const text = (message.content.text || "").toLowerCase();
      const products = await getStateValue<ProductCandidate[]>(state, "productCandidates");

      if (!products || products.length === 0) {
        return { success: true, text: "Tidak ada produk untuk difilter. Kirim foto produk dulu ya." };
      }

      let minPrice = 0;
      let maxPrice = Infinity;
      let minRating = 0;

      const underMatch = text.match(/di bawah\s*(?:rp\.?\s*)?([\d,]+)/i);
      const aboveMatch = text.match(/di atas\s*(?:rp\.?\s*)?([\d,]+)/i);
      const rangeMatch = text.match(/rp\.?\s*([\d,]+)\s*-\s*rp\.?\s*([\d,]+)/i);
      const maxMatch = text.match(/max(?:imum)?\s*(?:rp\.?\s*)?([\d,]+)/i);
      
      if (underMatch) {
        maxPrice = parseInt(underMatch[1].replace(/,/g, ""), 10);
      } else if (rangeMatch) {
        minPrice = parseInt(rangeMatch[1].replace(/,/g, ""), 10);
        maxPrice = parseInt(rangeMatch[2].replace(/,/g, ""), 10);
      } else if (maxMatch) {
        maxPrice = parseInt(maxMatch[1].replace(/,/g, ""), 10);
      }

      const ratingMatch = text.match(/rating\s*(?:min|minimum)?\s*(\d+(?:\.\d+)?)/i);
      if (ratingMatch) {
        minRating = parseFloat(ratingMatch[1]);
      }

      const filtered = products.filter(p => 
        p.harga >= minPrice && 
        p.harga <= maxPrice && 
        p.rating >= minRating
      );

      if (filtered.length === 0) {
        return { success: true, text: `Tidak ada produk yang sesuai filter.\n\nBudget: Rp ${maxPrice.toLocaleString("id-ID")}\nRating min: ${minRating}\n\nCoba budget lain ya.` };
      }

      await setStateValue(state, "productCandidates", filtered);

      let response = `🔍 *Hasil Filter*\n\nDitemukan ${filtered.length} produk sesuai:\n\n`;
      
      for (let i = 0; i < Math.min(filtered.length, 5); i++) {
        const p = filtered[i];
        response += `${i + 1}. *${p.nama}*\n`;
        response += `   💰 Rp ${p.harga.toLocaleString("id-ID")}\n`;
        response += `   🏪 ${p.toko} | ⭐ ${p.rating}\n\n`;
      }

      response += `Ketik nomor untuk memilih produk.`;

      return { success: true, text: response };
    } catch (error) {
      console.error("[Action] Error filtering products:", error);
      return { success: false, text: "Maaf, terjadi kesalahan saat memfilter produk." };
    }
  },

  examples: [
    [
      {
        name: "user",
        content: { text: "yang di bawah 200 ribu" },
      },
      {
        name: "Zeta",
        content: {
          text: "🔍 *Hasil Filter*\n\nDitemukan 2 produk sesuai:\n\n1. *Produk A*\n   💰 Rp 150.000\n   🏪 Toko X | ⭐ 4.5\n\nKetik nomor untuk memilih produk.",
        },
      },
    ],
  ],
};

export default filterProducts;
