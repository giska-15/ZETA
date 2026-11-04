/**
 * Zeta Shopping Provider
 * Menyuntikkan konteks state shopping ke prompt LLM supaya agent
 * tahu produk mana yang dipilih, step mana, dan apa yang harus ditanyakan.
 */

import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import {
  readShoppingState,
  STEP_INSTRUCTIONS,
  NEXT_ACTIONS,
} from "../services/state-machine";

export const zetaProvider: Provider = {
  name: "ZETA_SHOPPING_CONTEXT",
  description:
    "Konteks alur belanja Zeta: step saat ini, produk terpilih, ongkir, fee, dan pembayaran.",
  get: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    state: State,
  ): Promise<ProviderResult> => {
    const shopping = await readShoppingState(state);

    const lines: string[] = [
      `Status: ${shopping.step}`,
      `Instruksi: ${STEP_INSTRUCTIONS[shopping.step]}`,
    ];

    const products = shopping.productCandidates ?? [];
    if (products.length > 0) {
      const idx = shopping.selectedProductIndex ?? 0;
      const selected = products[idx];
      lines.push(
        `Produk terpilih: ${selected?.nama ?? "-"} (Rp ${Number(
          selected?.harga ?? 0,
        ).toLocaleString("id-ID")}) dari ${products.length} kandidat.`,
      );
    }

    if (shopping.jumlah) {
      lines.push(`Jumlah: ${shopping.jumlah}`);
    }

    if (shopping.userAddress) {
      lines.push(
        `Alamat: ${shopping.userAddress.kota} ${shopping.userAddress.kodePos}`,
      );
    }

    const shipping = shopping.shippingOptions ?? [];
    if (shipping.length > 0) {
      const idx = shopping.selectedShippingIndex ?? 0;
      const chosen = shipping[idx];
      lines.push(
        `Ongkir dipilih: ${chosen?.nama ?? "-"} ${chosen?.service ?? ""} Rp ${Number(
          chosen?.harga ?? 0,
        ).toLocaleString("id-ID")}`,
      );
    }

    if (shopping.feeResult) {
      lines.push(
        `Total bayar: Rp ${shopping.feeResult.totalBayar.toLocaleString("id-ID")} (fee ${shopping.feeResult.persen}%)`,
      );
    }

    if (shopping.paymentInfo) {
      lines.push(
        `Invoice: ${shopping.paymentInfo.invoiceId} | QRIS: ${shopping.paymentInfo.qrisUrl}`,
      );
    }

    lines.push(`Yang diharapkan dari user: ${NEXT_ACTIONS[shopping.step]}`);

    return {
      text: lines.join("\n"),
      values: {
        zetaStep: shopping.step,
        zetaInstruction: STEP_INSTRUCTIONS[shopping.step],
        zetaNextAction: NEXT_ACTIONS[shopping.step],
        zetaProductCount: products.length,
        zetaTotalBayar: shopping.feeResult?.totalBayar ?? 0,
      },
      data: { shopping },
    };
  },
};
