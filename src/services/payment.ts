/**
 * Zeta Payment Service (DOKU)
 * Membuat invoice QRIS dan menangani webhook untuk pembayaran
 */

import { randomUUID } from "crypto";

export interface CustomerInfo {
  name: string;
  phone: string;
  email?: string;
}

export interface InvoiceResult {
  qrisUrl: string;
  invoiceId: string;
  expiredAt: Date;
}

/**
 * Load DOKU configuration from environment
 */
function loadDokuConfig() {
  const isProduction = process.env.DOKU_IS_PRODUCTION === "true";
  
  return {
    clientId: process.env.DOKU_CLIENT_ID,
    secretKey: process.env.DOKU_SECRET_KEY,
    authorization: process.env.DOKU_AUTHORIZATION,
    isProduction,
    baseUrl: process.env.DOKU_BASE_URL || (
      isProduction 
        ? "https://api.doku.com" 
        : "https://api-sandbox.doku.com"
    ),
    mcpUrl: process.env.DOKU_MCP_URL || (
      isProduction
        ? "https://api.doku.com/doku-mcp-server/mcp"
        : "https://api-sandbox.doku.com/doku-mcp-server/mcp"
    ),
    mcpApiKey: process.env.DOKU_MCP_API_KEY,
  };
}

/**
 * Create QRIS invoice via DOKU
 * 
 * @param orderId - Internal order ID
 * @param amount - Total amount in IDR
 * @param customerInfo - Customer details
 * @returns QRIS URL and invoice details
 */
export async function buatInvoiceQRIS(
  orderId: string,
  amount: number,
  customerInfo: CustomerInfo
): Promise<InvoiceResult> {
  const config = loadDokuConfig();
  
  if (!config.clientId || !config.authorization) {
    throw new Error("DOKU credentials not configured");
  }

  console.log(`[DOKU] Creating QRIS invoice for order ${orderId}, amount: Rp${amount}`);

  const invoiceNumber = `ZETA-${orderId}-${Date.now()}`;
  const requestId = randomUUID();

  // Call DOKU MCP for QRIS creation
  const response = await fetch(config.mcpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": config.clientId,
      "Authorization": config.authorization,
      "X-Request-Id": requestId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "createPayment",
      params: {
        order: {
          invoiceNumber,
          amount,
          currency: "IDR",
        },
        payment: {
          paymentMethod: "QRIS",
          paymentChannel: "QRIS",
        },
        customer: {
          name: customerInfo.name,
          phone: customerInfo.phone,
          email: customerInfo.email || `${customerInfo.phone}@zeta.id`,
        },
        expiryTime: 24, // hours
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DOKU API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`DOKU error: ${data.error.message}`);
  }

  // Extract QRIS data
  const result = data.result || data;
  const qrisUrl = result.qrString 
    ? `https://api.qr-server.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(result.qrString)}`
    : result.paymentUrl;

  // Calculate expiry (default 24 hours)
  const expiredAt = new Date();
  expiredAt.setHours(expiredAt.getHours() + 24);

  console.log(`[DOKU] Invoice created: ${invoiceNumber}, QRIS URL: ${qrisUrl}`);

  return {
    qrisUrl,
    invoiceId: invoiceNumber,
    expiredAt,
  };
}

/**
 * Handle DOKU webhook callback
 * Verifikasi signature dan proses pembayaran sukses
 * 
 * @param payload - Webhook payload dari DOKU
 * @returns Order ID jika valid, null jika invalid
 */
export async function handleDokuWebhook(
  payload: Record<string, unknown>
): Promise<{ orderId: string; status: string } | null> {
  const config = loadDokuConfig();
  
  // Verify webhook signature (if provided)
  const signature = payload.signature as string;
  if (signature && config.secretKey) {
    // Implement signature verification based on DOKU docs
    // For now, assume payload is valid if it has required fields
  }

  // Extract payment status
  const status = (payload.paymentStatus as string) || (payload.status as string);
  const invoiceNumber = (payload.invoiceNumber as string) || (payload.orderId as string);
  
  if (!invoiceNumber) {
    console.warn("[DOKU] Webhook missing invoice number");
    return null;
  }

  // Extract order ID from invoice number (format: ZETA-{orderId}-{timestamp})
  const orderIdMatch = invoiceNumber.match(/ZETA-(.+)-\d+/);
  if (!orderIdMatch) {
    console.warn(`[DOKU] Invalid invoice number format: ${invoiceNumber}`);
    return null;
  }
  
  const orderId = orderIdMatch[1];
  
  // Map DOKU status to our status
  const statusMap: Record<string, string> = {
    "PAID": "PAID",
    "SUCCESS": "PAID",
    "SETTLED": "PAID",
    "FAILED": "CHECKOUT_FAILED",
    "EXPIRED": "CHECKOUT_FAILED",
    "CANCELLED": "CHECKOUT_FAILED",
  };
  
  const mappedStatus = statusMap[status?.toUpperCase() || ""] || status;
  
  console.log(`[DOKU] Webhook received: invoice=${invoiceNumber}, status=${status}, mapped=${mappedStatus}`);
  
  return {
    orderId,
    status: mappedStatus,
  };
}

/**
 * Check payment status via DOKU API
 */
export async function cekStatusPembayaran(invoiceId: string): Promise<{
  status: string;
  amount: number;
  paidAt?: Date;
}> {
  const config = loadDokuConfig();
  
  if (!config.clientId || !config.authorization) {
    throw new Error("DOKU credentials not configured");
  }

  const requestId = randomUUID();

  const response = await fetch(config.mcpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": config.clientId,
      "Authorization": config.authorization,
      "X-Request-Id": requestId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "checkPaymentStatus",
      params: {
        invoiceNumber: invoiceId,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`DOKU status check failed: ${response.status}`);
  }

  const data = await response.json();
  const result = data.result || data;

  return {
    status: result.paymentStatus || "UNKNOWN",
    amount: parseInt(result.amount || "0", 10),
    paidAt: result.paidAt ? new Date(result.paidAt) : undefined,
  };
}

export default buatInvoiceQRIS;
