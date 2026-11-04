/**
 * Action: Full Shopping Flow
 * Menjalankan semua step secara berurutan: cari → filter → ongkir → fee → checkout
 */

import { type Action, type IAgentRuntime, type Memory, type State, type ActionResult } from "@elizaos/core";
import { setStateValue } from "../utils/state";
import { searchProdukDariFoto } from "../services/vision";

export const fullShoppingFlow: Action = {
  name: "FULL_SHOPPING_FLOW",
  description: "Menjalankan full flow: cari produk → ongkir → hitung fee → checkout Shopee",
  
  validate: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<boolean> => {
    const text = (message.content.text || "").toLowerCase();
    const flowKeywords = ["beli", "belanja", "shopping", "aku mau", "cariin", "order", "beliin"];
    return flowKeywords.some(kw => text.includes(kw));
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ActionResult | void> => {
    console.log("[Action] FULL_SHOPPING_FLOW triggered");
    
    try {
      const hasImage = message.content.attachments?.some(
        (att) => att.contentType?.startsWith("image/")
      );

      if (!hasImage) {
        const response = `👋 *Halo! Aku Zeta - Asisten Belanja WhatsApp*\n\n` +
          `Aku bisa bantu cari produk di Shopee dari foto, hitung ongkir, fee, sampe checkout otomatis.\n\n` +
          `📸 *Cara pakai:*\n` +
          `1. Kirim foto produk yang mau dicari\n` +
          `2. Aku cari di Shopee\n` +
          `3. Pilih produk yang mau\n` +
          `4. Aku hitung ongkir + fee\n` +
          `5. Bayar via QRIS\n` +
          `6. Aku checkout ke Shopee\n\n` +
          `Kirim foto produk sekarang! 📦`;
        return { success: true, text: response };
      }

      const attachment = message.content.attachments?.find(
        (att) => att.contentType?.startsWith("image/")
      );
      
      if (!attachment?.url) {
        return { success: true, text: "Maaf, gambar tidak dapat dibaca." };
      }

      const imageResponse = await fetch(attachment.url);
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

      const products = await searchProdukDariFoto(imageBuffer);

      if (products.length === 0) {
        return { success: true, text: "Maaf, tidak ada produk serupa yang ditemukan di Shopee.\n\nCoba foto lain ya." };
      }

      await setStateValue(state, "productCandidates", products);
      await setStateValue(state, "currentStep", "product_found");

      let response = `📸 *Hasil Pencarian*\n\nDitemukan ${products.length} produk похожих:\n\n`;
      
      for (let i = 0; i < Math.min(products.length, 5); i++) {
        const p = products[i];
        response += `${i + 1}. *${p.nama}*\n`;
        response += `   💰 Rp ${p.harga.toLocaleString("id-ID")}\n`;
        response += `   🏪 ${p.toko} | ⭐ ${p.rating}\n\n`;
      }

      response += `Ketik nomor (1-5) untuk pilih produk, atau "filter" untuk harga tertentu.`;

      return { success: true, text: response };
    } catch (error) {
      console.error("[Action] Error in full flow:", error);
      return { success: false, text: "Maaf, terjadi kesalahan. Coba lagi ya." };
    }
  },
};

export default fullShoppingFlow;
