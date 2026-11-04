/**
 * Action: Calculate Fee
 * Menghitung biaya layanan Zeta (fee + ongkir)
 */

import { type Action, type IAgentRuntime, type Memory, type State, type ActionResult } from "@elizaos/core";
import { getStateValue, setStateValue } from "../utils/state";
import { hitungBiayaLayanan } from "../services/fee";

export const calculateFee: Action = {
  name: "CALCULATE_FEE",
  description: "Menghitung biaya layanan Zeta (fee % dari harga produk + ongkir)",
  
  validate: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<boolean> => {
    const text = (message.content.text || "").toLowerCase();
    const hasProduct = await getStateValue(state, "productCandidates");

    const feeKeywords = ["total", "fee", "biaya", "checkout", "bayar", "totalnya", "itung"];

    return !!hasProduct && feeKeywords.some(kw => text.includes(kw));
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ActionResult | void> => {
    console.log("[Action] CALCULATE_FEE triggered");
    
    try {
      const products = await getStateValue<any[]>(state, "productCandidates");
      const selectedIndex = (await getStateValue<number>(state, "selectedProductIndex")) || 0;
      const shippingOptions = await getStateValue<any[]>(state, "shippingOptions");
      const selectedShippingIndex = (await getStateValue<number>(state, "selectedShippingIndex")) || 0;
      const jumlah = (await getStateValue<number>(state, "jumlah")) || 1;
      
      if (!products || products.length === 0) {
        return { success: true, text: "Pilih produk dulu ya." };
      }

      const product = products[selectedIndex];
      let ongkir = 0;
      if (shippingOptions && shippingOptions[selectedShippingIndex]) {
        ongkir = shippingOptions[selectedShippingIndex].biaya || 0;
      }

      const subtotal = product.harga * jumlah;
      const feeResult = hitungBiayaLayanan(subtotal);
      const totalBayar = subtotal + ongkir + feeResult.biaya;

      await setStateValue(state, "feeResult", { ...feeResult, ongkir, totalBayar });
      await setStateValue(state, "currentStep", "fee_calculated");

      let response = `💰 *Rincian Biaya*\n\n`;
      response += `📦 *Produk*\n${product.nama}\n`;
      response += `Rp ${product.harga.toLocaleString("id-ID")} x ${jumlah} = Rp ${subtotal.toLocaleString("id-ID")}\n\n`;
      
      if (ongkir > 0) {
        response += `🚚 *Ongkir*\nRp ${ongkir.toLocaleString("id-ID")}\n\n`;
      }
      
      response += `📊 *Fee Zeta*\n${feeResult.persen}% x Rp ${feeResult.subtotal.toLocaleString("id-ID")} = Rp ${feeResult.biaya.toLocaleString("id-ID")}\n\n`;
      response += `━━━━━━━━━━━━━━━━━━━━━\n`;
      response += `💳 *TOTAL BAYAR*\n*Rp ${totalBayar.toLocaleString("id-ID")}*\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
      response += `Ketik "checkout" untuk lanjut, atau "batal".`;

      return { success: true, text: response };
    } catch (error) {
      console.error("[Action] Error calculating fee:", error);
      return { success: false, text: "Maaf, terjadi kesalahan saat menghitung biaya." };
    }
  },
};

export default calculateFee;
