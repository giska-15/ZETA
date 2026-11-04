/**
 * Action: Shopping Flow (State Machine driven)
 *
 * Action utama yang menjalankan seluruh alur belanja menggunakan state machine.
 * Action lain (filter, shipping, fee, payment, checkout) tetap tersedia untuk
 * pemanggilan eksplisit, tapi action ini yang mengorkestrasi percakapan penuh.
 */

import {
  type Action,
  type IAgentRuntime,
  type Memory,
  type State,
  type ActionResult,
} from "@elizaos/core";
import { handleMessage } from "../services/shopping-flow";
import { readShoppingState } from "../services/state-machine";
import { getStateValue } from "../utils/state";

export const shoppingFlow: Action = {
  name: "SHOPPING_FLOW",
  description:
    "Alur belanja lengkap Zeta: foto produk → cari di Shopee → filter → ongkir → fee → QRIS → checkout",
  examples: [
    [
      {
        name: "user",
        content: {
          text: "cariin dong sepatu lari hitam",
          attachments: [{ id: "img-1", url: "https://example.com/shoe.jpg" }],
        },
      },
      {
        name: "Zeta",
        content: {
          text: "📸 *Hasil Pencarian Produk*\n\nDitemukan 5 produk serupa:\n\n1. *Sepatu Lari Hitam X*\n   💰 Rp 450.000\n   🏪 Sport Store | ⭐ 4.8\n\nKetik nomor (1-5) untuk pilih.",
        },
      },
    ],
  ],

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
  ): Promise<boolean> => {
    const text = (message.content.text || "").toLowerCase();
    const hasImage = message.content.attachments?.some(
      (att) => att.contentType?.startsWith("image/") || att.url,
    );

    // Kalau ada gambar → selalu tangani
    if (hasImage) return true;

    // Kalau ada state shopping yang sedang berjalan → tangani
    const shopping = await readShoppingState(state);
    if (shopping.step !== "waiting_for_image" && shopping.step !== "idle") {
      return true;
    }

    // Kata kunci yang memulai percakapan belanja
    const keywords = [
      "cari",
      "cariin",
      "find",
      "beli",
      "belanja",
      "shopping",
      "checkout",
      "order",
      "beliin",
      "mau",
      "gambar",
      "foto",
      "produk",
    ];

    return keywords.some((kw) => text.includes(kw));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
  ): Promise<ActionResult | void> => {
    console.log("[Action] SHOPPING_FLOW triggered");

    try {
      const text = message.content.text || "";
      const attachment = message.content.attachments?.find(
        (att) => att.contentType?.startsWith("image/") || att.url,
      );

      const result = await handleMessage(state, text, attachment?.url);

      await getStateValue(state, "zetaShoppingState");

      return { success: result.success, text: result.text };
    } catch (error) {
      console.error("[Action] Error in shopping flow:", error);
      return {
        success: false,
        text: "Maaf, ada kendala di sistem. Coba ulangi ya 🙏",
      };
    }
  },
};

export default shoppingFlow;
