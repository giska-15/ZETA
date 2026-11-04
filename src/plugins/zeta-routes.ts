/**
 * Zeta WhatsApp Routes
 *
 * Webhook WAHA khusus alur belanja Zeta:
 *   POST /webhook/waha/zeta   → pesan masuk (text + gambar)
 *   GET  /api/v1/zeta/status  → status session & konfigurasi
 *
 * Alur pesan:
 *   1. WAHA kirim event "message"
 *   2. Ambil URL media (kalau ada gambar)
 *   3. Jalankan handleMessage() dari shopping-flow dengan session state
 *   4. Kirim balasan teks + QRIS (jika ada) ke user
 */

import type { RouteRequest, RouteResponse } from "@elizaos/core";
import { WahaClient, loadWahaConfig } from "./waha-client.ts";
import { routeJson } from "./helpers.ts";
import { handleMessage } from "../services/shopping-flow";
import {
  createSessionState,
  getSession,
  updateSession,
  activeSessionCount,
  normalizePhone,
} from "../services/zeta-session";
import { readShoppingState } from "../services/state-machine";

/** Buang markdown bold dari teks agar rapi di WhatsApp */
function stripBold(text: string): string {
  return text.replace(/\*/g, "");
}

/**
 * Ambil URL media dari payload WAHA.
 * Struktur payload WAHA: payload.mediaUrl | payload._data.mediaUrl | payload.body
 */
function extractMediaUrl(payload: any): string | null {
  const candidates = [
    payload?.mediaUrl,
    payload?._data?.mediaUrl,
    payload?.media?.url,
    payload?.body,
    payload?.quotedMessage?.mediaUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("http")) {
      return candidate;
    }
  }
  return null;
}

function isImagePayload(payload: any): boolean {
  const mimetype =
    payload?._data?.mimetype ?? payload?.mimetype ?? payload?.media?.mimetype;
  if (typeof mimetype === "string") return mimetype.startsWith("image/");
  return Boolean(extractMediaUrl(payload));
}

function extractPhone(from: unknown): string {
  if (typeof from !== "string") return "";
  return normalizePhone(
    from.replace("@c.us", "").replace("@s.whatsapp.net", "").replace("@g.us", ""),
  );
}

/**
 * Kirim balasan ke WhatsApp. Error tidak boleh menggagalkan webhook.
 */
async function reply(
  client: WahaClient,
  phone: string,
  text: string,
): Promise<void> {
  if (!client.isConfigured) return;
  try {
    await client.sendText(phone, stripBold(text));
  } catch (error) {
    console.error("[Zeta WA] failed to send text:", error);
  }
}

/**
 * Kirim QRIS sebagai gambar + caption.
 */
async function replyWithQris(
  client: WahaClient,
  phone: string,
  qrisUrl: string,
  caption: string,
): Promise<void> {
  if (!client.isConfigured) return;
  try {
    await client.sendImageFromUrl({
      phone,
      imageUrl: qrisUrl,
      caption: stripBold(caption),
      filename: "qris.png",
      mimetype: "image/png",
    });
  } catch (error) {
    console.error("[Zeta WA] failed to send QRIS image:", error);
    await reply(client, phone, caption);
  }
}

export const zetaWahaWebhookRoute = {
  name: "zeta-waha-webhook",
  path: "/webhook/waha/zeta",
  type: "POST" as const,
  public: true,
  handler: async (req: RouteRequest, res: RouteResponse, _runtime: any) => {
    const body = (req as any).body ?? {};
    const payload = body?.payload ?? {};

    if (body?.event !== "message" || payload?.fromMe === true) {
      return routeJson(res, { status: "ignored" });
    }

    const phone = extractPhone(payload?.from);
    if (!phone) {
      return routeJson(res, { status: "ignored", reason: "no phone" });
    }

    const client = new WahaClient(loadWahaConfig());
    const text = typeof payload?.body === "string" ? payload.body : "";
    const hasImage = isImagePayload(payload);
    const mediaUrl = hasImage ? extractMediaUrl(payload) : null;

    if (!text.trim() && !mediaUrl) {
      return routeJson(res, { status: "ignored", reason: "empty message" });
    }

    try {
      // State per nomor WA (bertahan antar HTTP request)
      const sessionState = createSessionState(phone);

      // Foto produk: unduh dari WAHA agar bisa di proses vision service
      let imageUrl: string | undefined;
      if (mediaUrl) {
        if (client.isConfigured) {
          const buffer = await client.downloadMedia(mediaUrl);
          if (buffer) {
            // Simpan sebagai data URL supaya bisa di-fetch oleh vision service
            imageUrl = `data:image/jpeg;base64,${buffer.toString("base64")}`;
          }
        }
        if (!imageUrl) {
          imageUrl = mediaUrl;
        }
      }

      const result = await handleMessage(sessionState, text, imageUrl);

      // Persist state ke session store
      const elizaState = await readShoppingState(sessionState);
      updateSession(phone, elizaState);

      // Kirim QRIS terpisah sebagai gambar bila ada
      const paymentInfo = elizaState.paymentInfo;
      if (paymentInfo?.qrisUrl && elizaState.step === "waiting_for_payment_proof") {
        await replyWithQris(
          client,
          phone,
          paymentInfo.qrisUrl,
          `💳 *QRIS Zeta*\n\nTotal: Rp ${paymentInfo.amount.toLocaleString("id-ID")}\nInvoice: ${paymentInfo.invoiceId}\n\nScan untuk bayar ya!`,
        );
      } else {
        await reply(client, phone, result.text);
      }

      return routeJson(res, {
        status: "ok",
        step: result.step,
        success: result.success,
      });
    } catch (error) {
      console.error("[Zeta WA] error:", error);
      await reply(
        client,
        phone,
        "❌ Ada kendala di sistem. Coba ulangi ya 🙏",
      );
      return routeJson(
        res,
        { error: error instanceof Error ? error.message : String(error) },
        200,
      );
    }
  },
};

export const zetaStatusRoute = {
  name: "zeta-status",
  path: "/api/v1/zeta/status",
  type: "GET" as const,
  rawPath: true,
  handler: async (_req: RouteRequest, res: RouteResponse, _runtime: any) => {
    const waha = loadWahaConfig();
    const client = new WahaClient(waha);
    const sessionActive = await client.isSessionActive();

    routeJson(res, {
      bot: "Zeta",
      waha: {
        configured: client.isConfigured,
        baseUrl: waha.baseUrl,
        session: waha.session,
        sessionActive,
      },
      activeSessions: activeSessionCount(),
      features: {
        visualSearch: Boolean(process.env.APIFY_TOKEN),
        shipping: Boolean(process.env.RAJAONGKIR_API_KEY),
        payment: Boolean(process.env.DOKU_CLIENT_ID),
        checkout: Boolean(process.env.SHOPEE_PROFILE_DIR),
      },
    });
  },
};

/** Helper: ambil state session untuk debugging */
export function getZetaSessionState(phone: string) {
  return getSession(phone).state;
}
