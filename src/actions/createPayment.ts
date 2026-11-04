/**
 * Action: Create Payment
 * Membuat pembayaran QRIS via DOKU
 */

import { type Action, type IAgentRuntime, type Memory, type State, type ActionResult } from "@elizaos/core";
import { getStateValue, setStateValue } from "../utils/state";
import { buatInvoiceQRIS, type CustomerInfo } from "../services/payment";

export const createPayment: Action = {
  name: "CREATE_PAYMENT",
  description: "Membuat pembayaran QRIS via DOKU untuk pesanan Zeta",
  
  validate: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<boolean> => {
    const text = (message.content.text || "").toLowerCase();
    const hasFeeResult = await getStateValue(state, "feeResult");

    const paymentKeywords = ["checkout", "bayar", "payment", "qris", "lunas", "konfirmasi", "oke", "ya", " lanjut"];

    return !!hasFeeResult && paymentKeywords.some(kw => text.includes(kw));
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ActionResult | void> => {
    console.log("[Action] CREATE_PAYMENT triggered");
    
    try {
      const feeResult = await getStateValue(state, "feeResult");
      const products = await getStateValue<any[]>(state, "productCandidates");
      const selectedIndex = (await getStateValue<number>(state, "selectedProductIndex")) || 0;
      const jumlah = (await getStateValue<number>(state, "jumlah")) || 1;
      
      if (!feeResult || !products) {
        return { success: true, text: "Ada yang salah. Coba dari awal ya, kirim foto produk." };
      }

      const product = products[selectedIndex];
      const userName = message.content.name || "Customer";
      const userPhone = (await getStateValue<string>(state, "userPhone")) || "";

      const customerInfo = {
        name: String(userName),
        phone: String(userPhone),
        email: (await getStateValue<string | undefined>(state, "userEmail")) as string | undefined,
      };

      const qrisResult = await buatInvoiceQRIS(`ZETA-${Date.now()}`, feeResult.totalBayar, customerInfo);

      await setStateValue(state, "paymentInfo", qrisResult);
      await setStateValue(state, "currentStep", "payment_created");

      let response = `💳 *Pembayaran QRIS*\n\n━━━━━━━━━━━━━━━━━━━━━\n`;
      response += `*TOTAL: Rp ${feeResult.totalBayar.toLocaleString("id-ID")}*\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
      response += `📱 Cara Bayar:\n1. Buka app bank/e-wallet\n2. Scan QRIS di bawah\n3. Konfirmasi pembayaran\n\n`;
      response += `⏰ Valid until: ${qrisResult.expiredAt.toLocaleString("id-ID")}\n\n`;
      response += `📋 *Invoice ID*: ${qrisResult.invoiceId}\n\n`;
      response += `QRIS: ${qrisResult.qrisUrl}\n\n`;
      response += `Setelah pembayaran, ketik "sudah" untuk lanjut ke checkout Shopee.`;

      return { success: true, text: response };
    } catch (error) {
      console.error("[Action] Error creating payment:", error);
      return { success: false, text: "Maaf, terjadi kesalahan saat membuat pembayaran. Coba lagi ya." };
    }
  },

  examples: [
    [
      {
        name: "user",
        content: { text: "checkout" },
      },
      {
        name: "Zeta",
        content: {
          text: "💳 *Pembayaran QRIS*\n\n━━━━━━━━━━━━━━━━━━━━━\n*TOTAL: Rp 528.000*\n━━━━━━━━━━━━━━━━━━━━━\n\n📱 Cara Bayar:\n1. Buka app bank/e-wallet\n2. Scan QRIS di bawah\n3. Konfirmasi pembayaran\n\n⏰ Valid until: 24:00\n\n📋 *Invoice ID*: ZETA-123456\n\nSetelah pembayaran, ketik \"sudah\".",
        },
      },
    ],
  ],
};

export default createPayment;
