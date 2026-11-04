export class WahaClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly session: string;

  constructor(config: { baseUrl: string; apiKey: string; session: string }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.session = config.session;
  }

  get isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey && this.session);
  }

  async sendText(phone: string, text: string): Promise<void> {
    await this.post("/api/sendText", {
      session: this.session,
      chatId: toWahaChatId(phone),
      text,
    });
  }

  async sendImage(params: {
    phone: string;
    imageUrl: string;
    caption?: string;
    filename?: string;
  }): Promise<void> {
    await this.post("/api/sendImage", {
      session: this.session,
      chatId: toWahaChatId(params.phone),
      file: {
        mimetype: "image/jpeg",
        url: params.imageUrl,
        filename: params.filename ?? "qris.jpeg",
      },
      caption: params.caption ?? "",
    });
  }

  async sendSeen(phone: string): Promise<void> {
    await this.post("/api/sendSeen", {
      session: this.session,
      chatId: toWahaChatId(phone),
    });
  }

  /**
   * Kirim gambar dari URL (dipakai untuk QRIS & screenshot bukti bayar).
   */
  async sendImageFromUrl(params: {
    phone: string;
    imageUrl: string;
    caption?: string;
    filename?: string;
    mimetype?: string;
  }): Promise<void> {
    await this.post("/api/sendImage", {
      session: this.session,
      chatId: toWahaChatId(params.phone),
      file: {
        mimetype: params.mimetype ?? "image/jpeg",
        url: params.imageUrl,
        filename: params.filename ?? "image.jpg",
      },
      caption: params.caption ?? "",
    });
  }

  /**
   * Kirim file dari base64 (dipakai untuk QRIS yang di-generate lokal).
   */
  async sendFileFromBase64(params: {
    phone: string;
    base64: string;
    filename: string;
    caption?: string;
    mimetype?: string;
  }): Promise<void> {
    await this.post("/api/sendFile", {
      session: this.session,
      chatId: toWahaChatId(params.phone),
      file: {
        mimetype: params.mimetype ?? "image/png",
        data: params.base64,
        filename: params.filename,
      },
      caption: params.caption ?? "",
    });
  }

  /**
   * Ambil URL media dari pesan WhatsApp (untuk foto produk user).
   */
  async getMediaUrl(messageId: string): Promise<string | null> {
    if (!this.isConfigured) return null;
    try {
      const response = await fetch(
        `${this.baseUrl}/api/getMediaUrl/${encodeURIComponent(messageId)}?session=${this.session}`,
        { headers: { "X-Api-Key": this.apiKey } },
      );
      if (!response.ok) return null;
      const body = await response.json().catch(() => null);
      const url =
        body?.url ?? body?.data?.url ?? body?.payload?.url ?? body?.mediaUrl;
      return typeof url === "string" ? url : null;
    } catch {
      return null;
    }
  }

  /**
   * Download file dari URL media WAHA (auth header diperlukan).
   */
  async downloadMedia(mediaUrl: string): Promise<Buffer | null> {
    if (!this.isConfigured) return null;
    try {
      const response = await fetch(mediaUrl, {
        headers: { "X-Api-Key": this.apiKey },
      });
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch {
      return null;
    }
  }

  /**
   * Cek apakah session WhatsApp aktif.
   */
  async isSessionActive(): Promise<boolean> {
    if (!this.isConfigured) return false;
    try {
      const response = await fetch(
        `${this.baseUrl}/api/sessions/${this.session}`,
        { headers: { "X-Api-Key": this.apiKey } },
      );
      if (!response.ok) return false;
      const body = await response.json().catch(() => null);
      const status = body?.status ?? body?.state;
      return status === "WORKING" || status === "STARTED" || status === "SCAN_QR_CODE" ? status === "WORKING" || status === "STARTED" : Boolean(body);
    } catch {
      return false;
    }
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    if (!this.isConfigured) throw new Error("WAHA client is not configured");

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `WAHA request failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`,
      );
    }
  }

  /**
   * POST dengan parsing JSON response.
   */
  private async postJson<T = unknown>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    if (!this.isConfigured) throw new Error("WAHA client is not configured");

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `WAHA request failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`,
      );
    }

    return (await response.json().catch(() => null)) as T;
  }
}

export function loadWahaConfig() {
  return {
    baseUrl: process.env.WAHA_BASE_URL ?? "",
    apiKey: process.env.WAHA_API_KEY ?? "",
    session: process.env.WAHA_SESSION ?? "default",
  };
}

export function normalizeWahaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

export function toWahaChatId(phone: string): string {
  return `${normalizeWahaPhone(phone)}@c.us`;
}
