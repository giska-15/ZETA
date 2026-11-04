/**
 * Action: Checkout Shopee
 * Melakukan checkout otomatis ke Shopee via Playwright
 */

import { type Action, type IAgentRuntime, type Memory, type State, type ActionResult } from "@elizaos/core";
import { getStateValue, setStateValue } from "../utils/state";
import { checkoutShopee as doCheckout } from "../services/shopee-bot";
import type { CheckoutInput } from "../services/shopee-bot";

export const checkoutShopeeAction: Action = {
  name: "CHECKOUT_SHOPEE",
  description: "Melakukan checkout otomatis ke Shopee setelah pembayaran berhasil",
  
  validate: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<boolean> => {
    const text = (message.content.text || "").toLowerCase();
    const hasPayment = await getStateValue(state, "paymentInfo");

    const confirmKeywords = ["sudah", "lunas", "terbayar", "done", "paid", "cek", "cek pembayaran"];

    return !!hasPayment && confirmKeywords.some(kw => text.includes(kw));
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ActionResult | void> => {
    console.log("[Action] CHECKOUT_SHOPEE triggered");
    
    try {
      const products = await getStateValue<any[]>(state, "productCandidates");
      const selectedIndex = (await getStateValue<number>(state, "selectedIndex")) || 0;
      const shippingOptions = await getStateValue<any[]>(state, "shippingOptions");
      const selectedShippingIndex = (await getStateValue<number>(state, "selectedShippingIndex")) || 0;
      const jumlah = (await getStateValue<number>(state, "jumlah")) || 1;
      const paymentInfo = await getStateValue(state, "paymentInfo");
      const userAddress = await getStateValue<{ nama: string; hp: string; alamat: string; kota: string; kodePos: string } | null>(state, "userAddress");
      
      if (!products || !shippingOptions || !paymentInfo || !userAddress) {
        return { success: true, text: "Ada data yang kurang. Coba dari awal ya." };
      }

      const product = products[selectedIndex];
      const shipping = shippingOptions[selectedShippingIndex];

      const checkoutInput: CheckoutInput = {
        produkUrl: product.url_shopee,
        jumlah: jumlah,
        metodeBayar: "ShopeePay",
        kurirPreferensi: [shipping.nama, "JNE", "J&T"],
      };

      let response = `🛒 *Mulai Checkout Shopee*\n\nProduk: ${product.nama}\nJumlah: ${jumlah}\nKurir: ${shipping.nama.toUpperCase()}\nAlamat: ${userAddress.kota}\n\n⏳ Harap tunggu... Browser akan terbuka.\n`;

      console.log("[Action] Starting Shopee checkout...");
      const checkoutResult = await doCheckout(checkoutInput);

      if (!checkoutResult.success) {
        return { success: false, text: `❌ *Checkout Gagal*\n\n${checkoutResult.failureReason || "Unknown error"}\n\nCoba lagi atau hubungi admin.` };
      }

      response = `✅ *Checkout Berhasil!*\n\n📦 *Detail Pesanan*\nOrder ID: ${checkoutResult.shopeeOrderId || "N/A"}\nProduk: ${product.nama}\nJumlah: ${jumlah}\n\n📱 *Langkah Selanjutnya*\n1. Buka Shopee app\n2. Cek pesanan di "Pesanan Saya"\n3. Konfirmasi terima barang jika sudah sampai\n\nTerima kasih sudah menggunakan Zeta! 🛍️`;

      await setStateValue(state, "currentStep", "completed");

      return { success: true, text: response };
    } catch (error) {
      console.error("[Action] Error during checkout:", error);
      return { success: false, text: `❌ *Checkout Gagal*\n\nTerjadi kesalahan saat checkout ke Shopee.\n\nCoba lagi dengan ketik "checkout ulang".\n\nError: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

export default checkoutShopeeAction;

