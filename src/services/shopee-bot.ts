/**
 * Zeta Shopee Checkout Service
 * Otomatis checkout ke Shopee menggunakan Playwright
 * 
 * WAJIB: headless=false (Shopee mendeteksi headless browser)
 */

import { chromium, type Browser, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

export interface CheckoutInput {
  produkUrl: string;
  jumlah: number;
  metodeBayar: "ShopeePay" | "COD" | "Bank";
  kurirPreferensi: string[]; // Urutan preferensi: ["JNE", "J&T", "SiCepat"]
}

export interface CheckoutResult {
  success: boolean;
  screenshotPath: string;
  shopeeOrderId?: string;
  failureReason?: string;
}

/**
 * Load Shopee configuration from environment
 */
function loadShopeeConfig() {
  const headless = process.env.SHOPEE_HEADLESS === "true";
  if (headless) {
    throw new Error("SHOPEE_HEADLESS=true is FORBIDDEN. Shopee detects headless browsers. Set SHOPEE_HEADLESS=false");
  }

  return {
    profileDir: process.env.SHOPEE_PROFILE_DIR || "./shopee-profile",
    headless: false,
    defaultPayment: process.env.SHOPEE_DEFAULT_PAYMENT || "ShopeePay",
    courierPreference: (process.env.SHOPEE_COURIER_PREFERENCE || "JNE,J&T,SiCepat").split(","),
  };
}

/**
 * Create logs directory for order
 */
function ensureLogDir(orderId: string): string {
  const logDir = path.join("./logs/shopee", orderId);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

/**
 * Take screenshot of current step
 */
async function takeScreenshot(page: Page, orderId: string, stepName: string, stepNumber: number): Promise<string> {
  const logDir = ensureLogDir(orderId);
  const filename = `${stepNumber.toString().padStart(2, "0")}-${stepName}.png`;
  const filepath = path.join(logDir, filename);
  
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`[Shopee] Screenshot saved: ${filepath}`);
  
  return filepath;
}

/**
 * Random delay to mimic human behavior
 */
function humanDelay(): Promise<void> {
  const min = 1500;
  const max = 3500;
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Robust click with multiple selector fallbacks
 */
async function robustClick(page: Page, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    try {
      // Try by role first
      if (selector.includes("button") || selector.includes("btn")) {
        const byRole = await page.getByRole("button", { name: new RegExp(selector.replace(/[^a-zA-Z]/g, ""), "i") }).first();
        if (await byRole.isVisible()) {
          await byRole.click();
          return true;
        }
      }
      
      // Try by text
      const byText = await page.getByText(new RegExp(selector, "i")).first();
      if (await byText.isVisible()) {
        await byText.click();
        return true;
      }
      
      // Try CSS selector
      const byCss = await page.locator(selector).first();
      if (await byCss.isVisible()) {
        await byCss.click();
        return true;
      }
    } catch {
      // Try next selector
    }
  }
  return false;
}

/**
 * Robust wait for selector with multiple fallbacks
 */
async function robustWait(page: Page, selectors: string[], timeout: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    for (const selector of selectors) {
      try {
        const locator = page.locator(selector);
        if (await locator.first().isVisible()) {
          return true;
        }
      } catch {
        // Continue
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

/**
 * Check if session is logged in
 */
async function checkSessionValid(page: Page): Promise<boolean> {
  await page.goto("https://shopee.co.id", { waitUntil: "networkidle" });
  
  // Check if redirected to login
  const currentUrl = page.url();
  if (currentUrl.includes("login") || currentUrl.includes("auth")) {
    return false;
  }
  
  // Check for user avatar or account element
  try {
    const avatar = await page.getByTestId("header-user-avatar").first();
    if (await avatar.isVisible()) {
      return true;
    }
  } catch {
    // Try alternative
  }
  
  return true;
}

/**
 * Main checkout function
 */
export async function checkoutShopee(input: CheckoutInput): Promise<CheckoutResult> {
  const config = loadShopeeConfig();
  const orderId = `order_${Date.now()}`;
  const logDir = ensureLogDir(orderId);
  let browser: Browser | null = null;
  let stepNumber = 0;

  console.log(`[Shopee] Starting checkout for order ${orderId}`);
  console.log(`[Shopee] Product: ${input.produkUrl}`);
  console.log(`[Shopee] Quantity: ${input.jumlah}`);
  console.log(`[Shopee] Payment: ${input.metodeBayar}`);

  try {
    // Launch browser
    browser = await chromium.launch({
      headless: config.headless,
      args: ["--disable-blink-features=AutomationControlled"],
    });

    // Create context with settings
    const ctx = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "id-ID",
      timezoneId: "Asia/Jakarta",
    });

    const page = await ctx.newPage();

    // Inject script to hide webdriver
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    // ========== STEP 1: Go to product page ==========
    stepNumber++;
    console.log(`[Shopee] Step ${stepNumber}: Navigating to product...`);
    await page.goto(input.produkUrl, { waitUntil: "networkidle", timeout: 60000 });
    await takeScreenshot(page, orderId, "01-product-page", stepNumber);
    await humanDelay();

    // ========== STEP 2: Click "Beli Sekarang" ==========
    stepNumber++;
    console.log(`[Shopee] Step ${stepNumber}: Clicking Buy Now...`);
    
    // Try various selectors for Buy Now button
    const buyNowSelectors = [
      "button.btn-buy-now",
      ".btn-buy-now",
      "button:has-text('Beli Sekarang')",
      "button:has-text('Buy Now')",
      '[data-testid="btn-buy-now"]',
    ];
    
    const clicked = await robustClick(page, buyNowSelectors);
    if (!clicked) {
      throw new Error("Could not find Buy Now button");
    }
    
    await humanDelay();
    await takeScreenshot(page, orderId, "02-after-buy-click", stepNumber);

    // ========== STEP 3: Select address (use default/first) ==========
    stepNumber++;
    console.log(`[Shopee] Step ${stepNumber}: Selecting address...`);
    
    // Check if address selection is needed
    const addressSelectors = [
      ".address-card",
      ".shopee-address-card",
      '[data-testid="address-card"]',
    ];
    
    await robustWait(page, addressSelectors, 10000);
    const addressCard = await page.locator(".address-card, .shopee-address-card").first();
    if (await addressCard.isVisible()) {
      await addressCard.click();
    }
    
    await humanDelay();
    await takeScreenshot(page, orderId, "03-address-selected", stepNumber);

    // ========== STEP 4: Select courier ==========
    stepNumber++;
    console.log(`[Shopee] Step ${stepNumber}: Selecting courier...`);
    
    // Wait for courier section to load
    await page.waitForSelector(".shipping-option, .logistics-card", { timeout: 15000 });
    await humanDelay();
    
    // Try each preferred courier in order
    for (const kurir of input.kurirPreferensi) {
      const courierSelectors = [
        `text=${kurir}`,
        `.shipping-option:has-text('${kurir}')`,
        `.logistics-card:has-text('${kurir}')`,
      ];
      
      for (const sel of courierSelectors) {
        try {
          const option = page.locator(sel).first();
          if (await option.isVisible()) {
            await option.click();
            console.log(`[Shopee] Selected courier: ${kurir}`);
            break;
          }
        } catch {
          // Try next
        }
      }
    }
    
    await humanDelay();
    await takeScreenshot(page, orderId, "04-courier-selected", stepNumber);

    // ========== STEP 5: Select payment method ==========
    stepNumber++;
    console.log(`[Shopee] Step ${stepNumber}: Selecting payment method...`);
    
    // Map payment method to Shopee's payment options
    const paymentMap: Record<string, string[]> = {
      "ShopeePay": ["ShopeePay", "Saldo ShopeePay"],
      "COD": ["COD", "Bayar di Tempat"],
      "Bank": ["Transfer", "Bank Transfer"],
    };
    
    const paymentOptions = paymentMap[input.metodeBayar] || paymentMap["ShopeePay"];
    
    for (const option of paymentOptions) {
      const paymentSelectors = [
        `text=${option}`,
        `.payment-method:has-text('${option}')`,
        `[data-testid="payment-${option.toLowerCase()}"]`,
      ];
      
      for (const sel of paymentSelectors) {
        try {
          const paymentOption = page.locator(sel).first();
          if (await paymentOption.isVisible()) {
            await paymentOption.click();
            console.log(`[Shopee] Selected payment: ${option}`);
            break;
          }
        } catch {
          // Try next
        }
      }
    }
    
    await humanDelay();
    await takeScreenshot(page, orderId, "05-payment-selected", stepNumber);

    // ========== STEP 6: Click "Buat Pesanan" ==========
    stepNumber++;
    console.log(`[Shopee] Step ${stepNumber}: Placing order...`);
    
    const orderSelectors = [
      "button:has-text('Buat Pesanan')",
      "button:has-text('Place Order')",
      ".btn-place-order",
      '[data-testid="btn-place-order"]',
    ];
    
    const orderClicked = await robustClick(page, orderSelectors);
    if (!orderClicked) {
      throw new Error("Could not find Place Order button");
    }
    
    await humanDelay();
    
    // Wait for result
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    await takeScreenshot(page, orderId, "06-order-result", stepNumber);

    // ========== STEP 7: Check for OTP/Captcha ==========
    stepNumber++;
    console.log(`[Shopee] Step ${stepNumber}: Checking for OTP/Captcha...`);
    
    const otpSelectors = [
      "input[placeholder*='OTP']",
      "input[name*='otp']",
      ".otp-input",
      "[data-testid*='otp']",
      ".captcha",
    ];
    
    let otpDetected = false;
    for (const sel of otpSelectors) {
      try {
        const otpInput = page.locator(sel).first();
        if (await otpInput.isVisible()) {
          otpDetected = true;
          const otpScreenshot = await takeScreenshot(page, orderId, "07-otp-detected", stepNumber);
          console.warn("[Shopee] OTP required! Screenshot saved for user assistance");
          
          // TODO: Send OTP notification to user via WAHA
          // For now, we'll wait up to 5 minutes for manual input
          await page.waitForTimeout(300000); // 5 minutes
          break;
        }
      } catch {
        // Continue
      }
    }

    // ========== STEP 8: Check order result ==========
    stepNumber++;
    console.log(`[Shopee] Step ${stepNumber}: Checking order result...`);
    
    const pageContent = await page.content();
    const pageText = await page.evaluate(() => document.body.innerText);
    
    // Check for success indicators
    const successIndicators = [
      "Pesanan Berhasil",
      "Order Successful",
      "Terima Kasih",
      "Order ID:",
      "Nomor Pesanan:",
    ];
    
    let success = false;
    let shopeeOrderId: string | undefined;
    
    for (const indicator of successIndicators) {
      if (pageText.includes(indicator)) {
        success = true;
        
        // Try to extract order ID
        const orderIdMatch = pageText.match(/Order ID[:\s]*([A-Z0-9]+)/i) 
          || pageText.match(/Nomor Pesanan[:\s]*([A-Z0-9]+)/i);
        if (orderIdMatch) {
          shopeeOrderId = orderIdMatch[1];
        }
        break;
      }
    }
    
    // Check for failure indicators
    const failureIndicators = [
      "Pesanan Gagal",
      "Order Failed",
      "Pembayaran Gagal",
      "Silakan Coba Lagi",
    ];
    
    let failureReason = "Unknown error";
    if (!success) {
      for (const indicator of failureIndicators) {
        if (pageText.includes(indicator)) {
          failureReason = indicator;
          break;
        }
      }
    }
    
    await takeScreenshot(page, orderId, success ? "08-success" : "08-failed", stepNumber);
    
    console.log(`[Shopee] Checkout ${success ? "SUCCESS" : "FAILED"}: ${failureReason}`);
    
    return {
      success,
      screenshotPath: path.join(logDir, "08-success.png"),
      shopeeOrderId,
      failureReason: success ? undefined : failureReason,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Shopee] Checkout error: ${errorMessage}`);
    
    return {
      success: false,
      screenshotPath: path.join(logDir, "00-error.png"),
      failureReason: errorMessage,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Check if Shopee session is still valid
 */
export async function checkShopeeSession(): Promise<{ valid: boolean; message: string }> {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto("https://shopee.co.id", { waitUntil: "networkidle" });
    const url = page.url();
    const valid = !url.includes("login") && !url.includes("auth");

    return {
      valid,
      message: valid 
        ? "Sesi Shopee untuk Zeta: VALID" 
        : "Sesi Shopee untuk Zeta: EXPIRED",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      message: `Error checking session: ${message}`,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export default checkoutShopee;
