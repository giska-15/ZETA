/**
 * Zeta Shopping Flow Orchestrator
 *
 * Menggabungkan State Machine + services (vision, shipping, fee, payment, shopee)
 * menjadi satu alur percakapan yang koheren.
 *
 * Dipakai oleh:
 *   - src/actions/shoppingFlow.ts   (ElizaOS action)
 *   - src/plugins/zeta-provider.ts   (provider context)
 */

import {
  readShoppingState,
  writeShoppingState,
  resetShoppingState,
  transition,
  forceStep,
  markFailed,
  parseSelection,
  parseQuantity,
  parseAddress,
  parseFilterCriteria,
  applyFilter,
  isRestartIntent,
  isPaymentConfirmation,
  NEXT_ACTIONS,
  STEP_MESSAGES,
  type ShoppingState,
  type ShoppingStep,
} from "./state-machine";
import { searchProdukDariFoto, type ProductCandidate } from "./vision";
import { hitungOngkir, type ShippingCostResult } from "./shipping";
import { hitungBiayaLayanan } from "./fee";
import { buatInvoiceQRIS, type CustomerInfo } from "./payment";

export interface FlowResult {
  success: boolean;
  text: string;
  step: ShoppingStep;
  state: ShoppingState;
}

/** Format daftar produk untuk WhatsApp */
function formatProductList(products: any[], limit = 5): string {
  let out = "";
  for (let i = 0; i < Math.min(products.length, limit); i++) {
    const p = products[i];
    out += `${i + 1}. *${p.nama}*\n`;
    out += `   💰 Rp ${Number(p.harga ?? 0).toLocaleString("id-ID")}\n`;
    out += `   🏪 ${p.toko ?? "-"} | ⭐ ${p.rating ?? "-"}`;
    if (p.terjual) out += ` | 🛍️ ${p.terjual} terjual`;
    out += `\n\n`;
  }
  return out;
}

/**
 * Ambil produk terpilih +-info-inya
 */
function getSelectedProduct(state: ShoppingState): any | null {
  const products = state.productCandidates ?? [];
  const idx = state.selectedProductIndex ?? 0;
  return products[idx] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Public API — step handlers                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Handle satu pesan user dan kembalikan respons + state baru.
 *
 * @param state  ElizaOS State
 * @param text   teks pesan user
 * @param imageUrl URL foto produk (opsional, jika user kirim gambar)
 */
export async function handleMessage(
  state: any,
  text: string,
  imageUrl?: string,
): Promise<FlowResult> {
  const normalized = (text || "").trim().toLowerCase();

  try {
    // 1. Restart intent — reset ke awal
    if (isRestartIntent(normalized)) {
      const fresh = await resetShoppingState(state);
      return {
        success: true,
        text: "🔄 *Mulai ulang!*\n\nKirim foto produk yang ingin dicari di Shopee 📸",
        step: fresh.step,
        state: fresh,
      };
    }

    let current = await readShoppingState(state);

    // 2. User kirim gambar → cari produk
    if (imageUrl) {
      const withResponse = await handleImage(state, imageUrl);
      return {
        success: true,
        text: withResponse.__response ?? "",
        step: withResponse.step,
        state: withResponse,
      };
    }

    // 3. Dispatch berdasarkan step
    switch (current.step) {
      case "waiting_for_image":
        return await handleWaitingForImage(state, text);

      case "waiting_for_product_selection":
        return await handleProductSelection(state, text);

      case "waiting_for_filter":
        return await handleFilter(state, text);

      case "waiting_for_quantity":
        return await handleQuantity(state, text);

      case "waiting_for_address":
        return await handleAddress(state, text);

      case "calculating_shipping":
        return await handleShippingSelection(state, text);

      case "checking_out":
        return await handleCheckout(state);

      case "waiting_for_payment_confirmation":
        return await handlePaymentConfirmation(state, text);

      case "waiting_for_payment_proof":
        return await handlePaymentProof(state, text);

      case "completed":
      case "failed":
        return {
          success: true,
          text: `${STEP_MESSAGES[current.step]}\n\n${NEXT_ACTIONS[current.step]}`,
          step: current.step,
          state: current,
        };

      default:
        return {
          success: true,
          text: `${STEP_MESSAGES[current.step]}\n\n${NEXT_ACTIONS[current.step]}`,
          step: current.step,
          state: current,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ShoppingFlow] Error:", error);
    const failed = await markFailed(state, message);
    return {
      success: false,
      text: `❌ *Terjadi kesalahan*\n\n${message}\n\nKetik "ulang" untuk mulai ulang.`,
      step: "failed",
      state: failed,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Step handlers                                                               */
/* -------------------------------------------------------------------------- */

async function handleWaitingForImage(
  state: any,
  text: string,
): Promise<FlowResult> {
  const current = await readShoppingState(state);

  // Coba parse alamat duluan bila user langsung kirim alamat
  const address = parseAddress(text);
  if (address) {
    return handleAddress(state, text);
  }

  return {
    success: true,
    text: `📸 *Kirim foto produk ya!*\n\nAku cari produk serupa di Shopee dari fotomu.\n\n_Hint: kirim foto, bukan ketik deskripsi._`,
    step: current.step,
    state: current,
  };
}

/**
 * Proses foto → cari produk di Shopee
 */
export async function handleImage(
  state: any,
  imageUrl: string,
): Promise<ShoppingState & { __response?: string }> {
  await forceStep(state, "searching", { imageUrl });

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Gagal mengunduh gambar (HTTP ${imageResponse.status})`);
  }
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  const products = await searchProdukDariFoto(imageBuffer);

  if (products.length === 0) {
    const failed = await markFailed(state, "Produk tidak ditemukan");
    return {
      ...failed,
      __response:
        "🔍 *Tidak ada produk serupa yang ditemukan*\n\nCoba foto lain yang lebih jelas ya 📸",
    };
  }

  const next = await transition(state, "waiting_for_product_selection", {
    productCandidates: products,
    selectedProductIndex: 0,
  });

  const response =
    `📸 *Hasil Pencarian Produk*\n\n` +
    `Ditemukan ${products.length} produk serupa:\n\n` +
    formatProductList(products) +
    `Ketik nomor (1-${Math.min(products.length, 5)}) untuk pilih, ` +
    `atau sebut filter budget (misal "maksimal 500rb").`;

  return { ...next.state, __response: response };
}

async function handleProductSelection(
  state: any,
  text: string,
): Promise<FlowResult> {
  const current = await readShoppingState(state);
  const products = current.productCandidates ?? [];

  // Filter intent?
  const criteria = parseFilterCriteria(text);
  const hasFilterKeyword = /budget|mahal|murah|harga|rating|max|min|di bawah|di atas|toko resmi/i.test(
    text,
  );

  if (hasFilterKeyword) {
    return handleFilter(state, text);
  }

  // Quantity intent?
  const qty = parseQuantity(text);
  if (qty !== null && !/^\s*\d{1,2}\s*$/.test(text.trim())) {
    return handleQuantity(state, text);
  }

  // Selection?
  const index = parseSelection(text, Math.min(products.length, 5));
  if (index === null) {
    return {
      success: true,
      text: `🤔 *Produk mana yang dipilih?*\n\nKetik nomor 1-${Math.min(products.length, 5)} ya.\n\n${formatProductList(products, 3)}`,
      step: current.step,
      state: current,
    };
  }

  const product = products[index];
  if (!product) {
    return {
      success: true,
      text: `Nomor ${index + 1} tidak ada. Pilih 1-${Math.min(products.length, 5)} ya.`,
      step: current.step,
      state: current,
    };
  }

  // Simpan pilihan, tanya jumlah
  const next = await transition(state, "waiting_for_quantity", {
    selectedProductIndex: index,
  });

  return {
    success: true,
    text:
      `✅ *Dipilih: ${product.nama}*\n` +
      `💰 Rp ${Number(product.harga ?? 0).toLocaleString("id-ID")}\n` +
      `🏪 ${product.toko ?? "-"}\n\n` +
      `Berapa mau dibeli? (contoh: 2)`,
    step: next.state.step,
    state: next.state,
  };
}

async function handleFilter(state: any, text: string): Promise<FlowResult> {
  const current = await readShoppingState(state);
  const products = current.productCandidates ?? [];
  const criteria = parseFilterCriteria(text);

  const filtered = applyFilter(products, criteria);

  if (filtered.length === 0) {
    const next = await transition(state, "waiting_for_filter", {
      filterCriteria: criteria,
    });
    const maxDesc = criteria.maxPrice
      ? `maks Rp ${criteria.maxPrice.toLocaleString("id-ID")}`
      : "filter tersebut";
    return {
      success: true,
      text: `😕 *Tidak ada produk yang cocok* dengan ${maxDesc}.\n\nCoba budget lain ya.`,
      step: next.state.step,
      state: next.state,
    };
  }

  const next = await transition(state, "waiting_for_product_selection", {
    productCandidates: filtered,
    filterCriteria: criteria,
    selectedProductIndex: 0,
  });

  const maxDesc = criteria.maxPrice
    ? `maks Rp ${criteria.maxPrice.toLocaleString("id-ID")}`
    : "filter kamu";
  const ratingDesc = criteria.minRating ? `, rating ≥ ${criteria.minRating}` : "";

  return {
    success: true,
    text:
      `🔍 *Hasil Filter* (${maxDesc}${ratingDesc})\n\n` +
      `Ditemukan ${filtered.length} produk:\n\n` +
      formatProductList(filtered) +
      `Ketik nomor untuk pilih.`,
    step: next.state.step,
    state: next.state,
  };
}

async function handleQuantity(state: any, text: string): Promise<FlowResult> {
  const current = await readShoppingState(state);
  const qty = parseQuantity(text);

  if (qty === null) {
    return {
      success: true,
      text: `🔢 *Berapa mau dibeli?*\n\nKetik angka saja, contoh: 2`,
      step: current.step,
      state: current,
    };
  }

  const next = await transition(state, "waiting_for_address", { jumlah: qty });

  const product = getSelectedProduct(next.state);

  return {
    success: true,
    text:
      `📦 *${qty} x ${product?.nama ?? "produk"}*\n` +
      `💰 Subtotal: Rp ${((product?.harga ?? 0) * qty).toLocaleString("id-ID")}\n\n` +
      `📍 *Alamat pengiriman*\n` +
      `Format: nama, nomor HP, alamat, kota, kode pos\n` +
      `Contoh: "Budi, 08123456789, Jl. Merdeka 1, Jakarta, 12345"`,
    step: next.state.step,
    state: next.state,
  };
}

async function handleAddress(state: any, text: string): Promise<FlowResult> {
  const current = await readShoppingState(state);
  const address = parseAddress(text);

  if (!address) {
    return {
      success: true,
      text:
        `📍 *Alamat belum lengkap*\n\n` +
        `Format: nama, nomor HP, alamat, kota, kode pos\n` +
        `Contoh: "Budi, 08123456789, Jl. Merdeka 1, Jakarta, 12345"`,
      step: current.step,
      state: current,
    };
  }

  const product = getSelectedProduct(current);
  const weight = 1000; // default 1kg, bisa di-refine nanti
  const shipping = await hitungOngkir(Number(address.kodePos) || 501, weight, "all");

  if (shipping.length === 0) {
    const failed = await markFailed(state, "Ongkir tidak tersedia");
    return {
      success: false,
      text: `🚫 *Tidak ada layanan kurir* untuk ${address.kota} (${address.kodePos}).\n\nCoba cek kode pos kamu ya.`,
      step: "failed",
      state: failed,
    };
  }

  const next = await transition(state, "calculating_shipping", {
    userAddress: address,
    shippingOptions: shipping,
    selectedShippingIndex: 0,
  });

  let response = `🚚 *Perkiraan Ongkir*\n\n`;
  response += `📍 ${address.kota} (${address.kodePos})\n`;
  response += `⚖️ Berat: ${weight}g\n\n`;
  for (let i = 0; i < Math.min(shipping.length, 5); i++) {
    const o = shipping[i];
    response += `${i + 1}. *${o.nama.toUpperCase()}* ${o.service}\n`;
    response += `   💰 Rp ${o.harga.toLocaleString("id-ID")} | ⏱️ ${o.estimasi}\n`;
  }
  response += `\nKetik nomor (1-${Math.min(shipping.length, 5)}) untuk pilih kurir, atau "oke" untuk termurah.`;

  return {
    success: true,
    text: response,
    step: next.state.step,
    state: next.state,
  };
}

async function handleShippingSelection(
  state: any,
  text: string,
): Promise<FlowResult> {
  const current = await readShoppingState(state);
  const shipping = current.shippingOptions ?? [];

  let selectedIndex = 0;
  if (!/oke|ok|termurah|yang termurah/i.test(text)) {
    const parsed = parseSelection(text, Math.min(shipping.length, 5));
    if (parsed === null) {
      return {
        success: true,
        text: `🚚 *Pilih kurir*\n\nKetik nomor 1-${Math.min(shipping.length, 5)} atau "oke" untuk termurah.`,
        step: current.step,
        state: current,
      };
    }
    selectedIndex = parsed;
  }

  const chosen = shipping[selectedIndex];
  const product = getSelectedProduct(current);
  const jumlah = current.jumlah ?? 1;
  const subtotal = (product?.harga ?? 0) * jumlah;

  const fee = hitungBiayaLayanan(subtotal);
  const ongkir = chosen?.harga ?? 0;
  const totalBayar = subtotal + ongkir + fee.biaya;

  const next = await transition(state, "calculating_fee", {
    selectedShippingIndex: selectedIndex,
  });

  const feeState = await writeShoppingState(state, {
    feeResult: {
      subtotal,
      persen: fee.persen,
      biaya: fee.biaya,
      ongkir,
      totalBayar,
    },
  });

  const confirmStep = await transition(state, "waiting_for_payment_confirmation");

  let response = `💰 *Rincian Biaya*\n\n`;
  response += `📦 ${product?.nama ?? "-"} x ${jumlah}\n`;
  response += `   Rp ${subtotal.toLocaleString("id-ID")}\n\n`;
  response += `🚚 ${chosen?.nama?.toUpperCase() ?? "-"} ${chosen?.service ?? ""}\n`;
  response += `   Rp ${ongkir.toLocaleString("id-ID")}\n\n`;
  response += `📊 Fee Zeta (${fee.persen}%)\n`;
  response += `   Rp ${fee.biaya.toLocaleString("id-ID")}\n\n`;
  response += `━━━━━━━━━━━━━━━━━━━━━\n`;
  response += `💳 *TOTAL: Rp ${totalBayar.toLocaleString("id-ID")}*\n`;
  response += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  response += `Ketik "oke" untuk lanjut pembayaran QRIS.`;

  return {
    success: true,
    text: response,
    step: confirmStep.state.step,
    state: confirmStep.state,
  };
}

async function handlePaymentConfirmation(
  state: any,
  text: string,
): Promise<FlowResult> {
  const current = await readShoppingState(state);

  if (!isPaymentConfirmation(text)) {
    return {
      success: true,
      text: `Hmm, belum yakin ya. Ketik "oke" untuk lanjut pembayaran, atau "batal" untuk membatalkan.`,
      step: current.step,
      state: current,
    };
  }

  const feeResult = current.feeResult;
  if (!feeResult) {
    const failed = await markFailed(state, "Fee result hilang");
    return {
      success: false,
      text: "Data pembayaran tidak ditemukan. Ketik 'ulang' untuk mulai ulang.",
      step: "failed",
      state: failed,
    };
  }

  const customerInfo: CustomerInfo = {
    name: current.userAddress?.nama ?? "Pelanggan",
    phone: current.userAddress?.hp ?? "",
    email: undefined,
  };

  const invoice = await buatInvoiceQRIS(
    `ZETA-${Date.now()}`,
    feeResult.totalBayar,
    customerInfo,
  );

  const next = await transition(state, "payment_created", {
    paymentInfo: {
      invoiceId: invoice.invoiceId,
      qrisUrl: invoice.qrisUrl,
      expiredAt: invoice.expiredAt.toISOString(),
      amount: feeResult.totalBayar,
    },
  });

  const proofStep = await transition(state, "waiting_for_payment_proof");

  let response = `💳 *Pembayaran QRIS*\n\n`;
  response += `━━━━━━━━━━━━━━━━━━━━━\n`;
  response += `*TOTAL: Rp ${feeResult.totalBayar.toLocaleString("id-ID")}*\n`;
  response += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  response += `📱 *Cara bayar:*\n`;
  response += `1. Buka app bank / e-wallet\n`;
  response += `2. Pilih Scan QR / QRIS\n`;
  response += `3. Scan kode QRIS ini\n`;
  response += `4. Konfirmasi pembayaran\n\n`;
  response += `🔗 QRIS: ${invoice.qrisUrl}\n`;
  response += `📋 Invoice: ${invoice.invoiceId}\n`;
  response += `⏰ Berlaku sampai: ${invoice.expiredAt.toLocaleString("id-ID")}\n\n`;
  response += `Setelah bayar, kirim screenshot bukti pembayaran ya 📸`;

  return {
    success: true,
    text: response,
    step: proofStep.state.step,
    state: proofStep.state,
  };
}

async function handlePaymentProof(
  state: any,
  text: string,
): Promise<FlowResult> {
  const current = await readShoppingState(state);

  const isProof =
    /sudah|bayar|lunas|terbayar|paid|done|selesai|bukti|screenshot/i.test(text);

  if (!isProof) {
    return {
      success: true,
      text: `📸 *Kirim bukti pembayaran ya*\n\nScreenshot dari app bank/e-wallet kamu.`,
      step: current.step,
      state: current,
    };
  }

  const next = await transition(state, "checking_out", {});

  return {
    success: true,
    text: `🛒 *Pembayaran diterima!*\n\n⏳ Sekarang aku checkout ke Shopee...\nBrowser akan terbuka, mohon tunggu sebentar.`,
    step: next.state.step,
    state: next.state,
  };
}

/**
 * Melakukan checkout otomatis ke Shopee via Playwright.
 */
export async function handleCheckout(state: any): Promise<FlowResult> {
  const current = await readShoppingState(state);

  const products = current.productCandidates ?? [];
  const product = getSelectedProduct(current);
  const shipping = current.shippingOptions?.[current.selectedShippingIndex ?? 0];
  const address = current.userAddress;
  const jumlah = current.jumlah ?? 1;

  if (!product || !shipping || !address) {
    const failed = await markFailed(state, "Data checkout tidak lengkap");
    return {
      success: false,
      text: `❌ *Data checkout tidak lengkap.*\n\nKetik "ulang" untuk mulai ulang ya.`,
      step: "failed",
      state: failed,
    };
  }

  const { checkoutShopee } = await import("./shopee-bot");

  const result = await checkoutShopee({
    produkUrl: product.url_shopee,
    jumlah,
    metodeBayar: "ShopeePay",
    kurirPreferensi: [shipping.nama, "JNE", "J&T"],
  });

  if (!result.success) {
    const failed = await markFailed(
      state,
      result.failureReason ?? "Checkout Shopee gagal",
    );
    return {
      success: false,
      text:
        `❌ *Checkout Gagal*\n\n${result.failureReason ?? "Unknown error"}\n\n` +
        `Screenshot: ${result.screenshotPath}\n\nCoba lagi dengan "checkout ulang".`,
      step: "failed",
      state: failed,
    };
  }

  const completed = await forceStep(state, "completed", {
    checkoutResult: {
      success: true,
      orderNumber: result.shopeeOrderId,
      shopeeOrderId: result.shopeeOrderId,
      message: "Checkout berhasil",
    },
  });

  return {
    success: true,
    text:
      `✅ *Checkout Berhasil!*\n\n` +
      `📦 *Detail Pesanan*\n` +
      `Order ID: ${result.shopeeOrderId ?? "N/A"}\n` +
      `Produk: ${product.nama}\n` +
      `Jumlah: ${jumlah}\n\n` +
      `📱 *Langkah selanjutnya*\n` +
      `1. Buka aplikasi Shopee\n` +
      `2. Cek pesanan di "Pesanan Saya"\n` +
      `3. Konfirmasi terima barang saat sampai\n\n` +
      `Terima kasih sudah pakai Zeta! 🛍️`,
    step: completed.step,
    state: completed,
  };
}
