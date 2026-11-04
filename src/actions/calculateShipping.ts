/**
 * Action: Calculate Shipping
 * Menghitung ongkir dari Shopee ke alamat user
 */

import { type Action, type IAgentRuntime, type Memory, type State, type ActionResult } from "@elizaos/core";
import { getStateValue, setStateValue } from "../utils/state";
import { hitungOngkir } from "../services/shipping";

export const calculateShipping: Action = {
  name: "CALCULATE_SHIPPING",
  description: "Menghitung ongkir dari Shopee ke alamat user menggunakan RajaOngkir",
  
  validate: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<boolean> => {
    const text = (message.content.text || "").toLowerCase();
    const hasProduct = await getStateValue(state, "productCandidates");

    const shippingKeywords = ["ongkir", "ongkos", "kirim", "shipping", "delivery", "kirimin", "di antar"];

    return !!hasProduct && shippingKeywords.some(kw => text.includes(kw));
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ActionResult | void> => {
    console.log("[Action] CALCULATE_SHIPPING triggered");
    
    try {
      const products = await getStateValue<any[]>(state, "productCandidates");
      const selectedIndex = (await getStateValue<number>(state, "selectedProductIndex")) || 0;

      if (!products || products.length === 0) {
        return { success: true, text: "Pilih produk dulu ya, kirim foto atau ketik nomor produk." };
      }

      const product = products[selectedIndex];
      const userAddress = await getStateValue<{ kota: string; kodePos: string } | null>(state, "userAddress");

      if (!userAddress) {
        return { success: true, text: "Untuk menghitung ongkir, saya butuh alamat lengkap:\n\n📍 Kota/Kabupaten?\n📮 Kode Pos?\n\nContoh: \"Jakarta Selatan, 12345\"" };
      }

      const weight = (await getStateValue<number>(state, "productWeight")) || 1000;

      const ongkirResults = await hitungOngkir(Number(userAddress.kodePos), weight, "all");

      if (ongkirResults.length === 0) {
        return { success: true, text: "Maaf, tidak ada layanan kurir yang tersedia untuk alamat ini." };
      }

      await setStateValue(state, "shippingOptions", ongkirResults);
      await setStateValue(state, "currentStep", "shipping_calculated");

      let response = `🚚 *Perkiraan Ongkir*\n\nProduk: ${product.nama}\nKe: ${userAddress.kota} (${userAddress.kodePos})\nBerat: ${weight}g\n\n`;
      
      for (const option of ongkirResults.slice(0, 5)) {
        response += `📦 *${option.nama.toUpperCase()}* - ${option.service}\n`;
        response += `   💰 Rp ${option.harga.toLocaleString("id-ID")}\n`;
        response += `   ⏱️ ${option.estimasi}\n\n`;
      }

      response += `Ketik nomor (1-${Math.min(ongkirResults.length, 5)}) untuk pilih kurir, atau "oke" untuk termurah.`;

      return { success: true, text: response };
    } catch (error) {
      console.error("[Action] Error calculating shipping:", error);
      return { success: false, text: "Maaf, terjadi kesalahan saat menghitung ongkir. Coba lagi ya." };
    }
  },

  examples: [
    [
      {
        name: "user",
        content: { text: "hitung ongkir ke jakarta" },
      },
      {
        name: "Zeta",
        content: {
          text: "🚚 *Perkiraan Ongkir*\n\nProduk: Sepatu Nike\nKe: Jakarta (12345)\nBerat: 1000g\n\n📦 *JNE* - REG\n   💰 Rp 18.000\n   ⏱️ 1-2 hari\n\nKetik nomor untuk pilih kurir.",
        },
      },
    ],
  ],
};

export default calculateShipping;
