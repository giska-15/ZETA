#!/usr/bin/env node

/**
 * Zeta setup script.
 *
 * - creates .env from .env.example when missing
 * - validates that required / optional integration keys are present
 * - verifies the Playwright browser binaries used by the Shopee bot
 *
 * Usage:
 *   node scripts/setup.js          # check only
 *   node scripts/setup.js --fix    # also install Playwright browsers
 */

import { existsSync, copyFileSync, readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const envExamplePath = join(root, ".env.example");
const fix = process.argv.includes("--fix");

/** Required for the bot to answer on WhatsApp at all. */
const REQUIRED = [
  { key: "WAHA_BASE_URL", hint: "http://localhost:3000 (WAHA container)" },
  { key: "WAHA_API_KEY", hint: "WAHA API key" },
];

/** Each unlocks one stage of the shopping flow; the bot degrades gracefully. */
const OPTIONAL = [
  { key: "GOOGLE_VISION_CREDENTIALS_JSON", hint: "Visual search (Google Vision)" },
  { key: "GOOGLE_VISION_PROJECT_ID", hint: "Visual search (Google Vision)" },
  { key: "APIFY_TOKEN", hint: "Visual search fallback (Apify Google Lens)" },
  { key: "RAJAONGKIR_API_KEY", hint: "Shipping cost calculation" },
  { key: "DOKU_CLIENT_ID", hint: "QRIS payment" },
  { key: "DOKU_SECRET_KEY", hint: "QRIS payment" },
  { key: "SHOPEE_PROFILE_DIR", hint: "Shopee auto-checkout" },
];

function parseEnv(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[key] = value;
  }
  return out;
}

function isFilled(value) {
  if (!value) return false;
  if (/^your_/i.test(value)) return false;
  if (/^change_?me$/i.test(value)) return false;
  if (value === "changeme") return false;
  return true;
}

function ensureEnvFile() {
  if (existsSync(envPath)) {
    console.log("✓ .env already exists");
    return;
  }
  if (!existsSync(envExamplePath)) {
    console.log("✗ .env.example not found — cannot create .env");
    return;
  }
  copyFileSync(envExamplePath, envPath);
  console.log("✓ created .env from .env.example");
}

function ensureProfileDir() {
  const dir = join(root, "shopee-profile");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log("✓ created shopee-profile/");
  }
}

async function ensurePlaywright() {
  try {
    const { chromium } = await import("playwright");
    const path = chromium.executablePath();
    if (existsSync(path)) {
      console.log("✓ Playwright chromium installed");
      return;
    }
  } catch {
    // fall through to install
  }
  if (!fix) {
    console.log("! Playwright chromium missing — run: npm run setup:fix");
    return;
  }
  console.log("… installing Playwright chromium (this can take a while)");
  const { execSync } = await import("child_process");
  execSync("npx playwright install chromium", { stdio: "inherit" });
  console.log("✓ Playwright chromium installed");
}

async function main() {
  console.log("── Zeta setup ──\n");
  ensureEnvFile();
  ensureProfileDir();

  if (!existsSync(envPath)) {
    console.log("\n⚠ no .env available — skipping validation");
    return;
  }

  const env = parseEnv(readFileSync(envPath, "utf8"));

  console.log("\nRequired:");
  let missingRequired = 0;
  for (const item of REQUIRED) {
    const ok = isFilled(env[item.key]);
    if (!ok) missingRequired += 1;
    console.log(`  ${ok ? "✓" : "✗"} ${item.key} — ${item.hint}`);
  }

  console.log("\nOptional (feature flags):");
  for (const item of OPTIONAL) {
    const ok = isFilled(env[item.key]);
    console.log(`  ${ok ? "✓" : "·"} ${item.key} — ${item.hint}`);
  }

  console.log("\nPlaywright:");
  await ensurePlaywright();

  console.log("");
  if (missingRequired > 0) {
    console.log(
      `✗ ${missingRequired} required key(s) missing — edit .env before starting the bot.`,
    );
    process.exitCode = 1;
  } else {
    console.log("✓ setup looks good. Start with: npm run dev");
  }
}

main().catch((err) => {
  console.error("setup failed:", err);
  process.exitCode = 1;
});
