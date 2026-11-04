/**
 * Action: Search Product from Image
 * Menerima foto produk, mencari di Shopee via Google Lens
 */

import { type Action, type IAgentRuntime, type Memory, type State, type ActionResult, type ActionExample } from "@elizaos/core";
import { setStateValue } from "../utils/state";
import { searchProdukDariFoto } from "../services/vision";

export const searchProductFromImage: Action = {
  name: "SEARCH_PRODUCT_FROM_IMAGE",
  description: "Mencari produk dari foto menggunakan Google Lens dan mengembalikan daftar produk dari Shopee",
  
  validate: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<boolean> => {
    const hasImage = message.content.attachments?.some(
      (att) => att.contentType?.startsWith("image/")
    );
    return !!hasImage;
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ActionResult | void> => {
    console.log("[Action] SEARCH_PRODUCT_FROM_IMAGE triggered");
    
    try {
      const attachment = message.content.attachments?.find(
        (att) => att.contentType?.startsWith("image/")
      );
      
      if (!attachment?.url) {
        return { success: true, text: "Maaf, saya tidak dapat membaca gambar tersebut. Coba kirim foto produk yang jelas ya." };
      }

      const imageResponse = await fetch(attachment.url);
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

      const products = await searchProdukDariFoto(imageBuffer);

      if (products.length === 0) {
        return { success: true, text: "Maaf, saya tidak dapat menemukan produk serupa di Shopee. Coba foto lain ya." };
      }

      await setStateValue(state, "productCandidates", products);
      await setStateValue(state, "currentStep", "product_selected");

      let response = `📸 *Hasil Pencarian Produk*\n\nDitemukan ${products.length} produk похожих:\n\n`;
      
      for (let i = 0; i < Math.min(products.length, 5); i++) {
        const p = products[i];
        response += `${i + 1}. *${p.nama}*\n`;
        response += `   💰 Rp ${p.harga.toLocaleString("id-ID")}\n`;
        response += `   🏪 ${p.toko} | ⭐ ${p.rating}\n`;
        response += `   🔗 ${p.url_shopee}\n\n`;
      }

      response += `Ketik nomor untuk memilih produk (1-${Math.min(products.length, 5)}), atau kirim foto lain untuk pencarian ulang.`;

      return { success: true, text: response };
    } catch (error) {
      console.error("[Action] Error searching product:", error);
      return { success: false, text: "Maaf, terjadi kesalahan saat mencari produk. Coba lagi ya." };
    }
  },

  examples: [
    [
      {
        name: "user",
        content: {
          text: "cari produk ini di shopee",
          attachments: [{ id: "example-1", url: "https://example.com/foto.jpg" }],
        },
      },
      {
        name: "Zeta",
        content: {
          text: "📸 *Hasil Pencarian Produk*\n\nDitemukan 3 produk похожих:\n\n1. *Sepatu Nike Air Max*\n   💰 Rp 500.000\n   🏪 Nike Official | ⭐ 4.9\n   🔗 shopee.co.id/...\n\nKetik nomor untuk memilih produk...",
        },
      },
    ],
  ],
};

export default searchProductFromImage;
