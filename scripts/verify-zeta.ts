#!/usr/bin/env bun

/**
 * Zeta end-to-end verification.
 *
 * Exercises the pure-logic layers of the shopping flow (state machine,
 * fee calculator, parsers, filter) without needing external APIs
 * (Shopee / RajaOngkir / DOKU / WAHA).
 *
 * Usage: bun run scripts/verify-zeta.ts
 */

import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  createInitialState,
  readShoppingState,
  writeShoppingState,
  transition,
  canTransition,
  parseSelection,
  parseQuantity,
  parseAddress,
  parseFilterCriteria,
  isRestartIntent,
  isPaymentConfirmation,
  applyFilter,
  resetShoppingState,
} from "../src/services/state-machine.ts";
import { hitungBiayaLayanan } from "../src/services/fee.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load .env into process.env so fee/vision/payment services see it
const envPath = join(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

let pass = 0;
let fail = 0;
const failures = [];

function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    const result = fn();
    if (result && typeof (result as Promise<unknown>).then === "function") {
      return (result as Promise<unknown>).then(
        () => {
          pass += 1;
          console.log(`  ✓ ${name}`);
        },
        (error: unknown) => {
          fail += 1;
          failures.push({ name, message: (error as Error)?.message ?? String(error) });
          console.log(`  ✗ ${name} — ${(error as Error)?.message ?? error}`);
        },
      );
    }
    if (result === false) throw new Error("assertion returned false");
    pass += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    fail += 1;
    failures.push({ name, message: (error as Error)?.message ?? String(error) });
    console.log(`  ✗ ${name} — ${(error as Error)?.message ?? error}`);
  }
  return undefined;
}

function eq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------------------
section("1. State machine — initial state & transitions");

check("initial step is waiting_for_image", async () => {
  const state = createInitialState();
  const cur = await readShoppingState(state);
  eq(cur.step, "waiting_for_image", "step");
  eq((cur.productCandidates ?? []).length, 0, "productCandidates length");
  eq(cur.errorCount, 0, "errorCount");
});

check("transition updates state and persists", async () => {
  const state = createInitialState();
  const next = await transition(state, "searching", { imageUrl: "http://x/y.jpg" });
  eq(next.ok, true, "ok");
  eq(next.state.step, "searching", "step");
  eq(next.state.imageUrl, "http://x/y.jpg", "imageUrl");
  const reread = await readShoppingState(state);
  eq(reread.step, "searching", "persisted step");
  eq(reread.imageUrl, "http://x/y.jpg", "persisted imageUrl");
});

check("illegal transition is rejected", () => {
  const ok = canTransition("waiting_for_image", "completed");
  eq(ok, false, "canTransition");
});

check("legal transition waiting_for_image -> searching is allowed", () => {
  eq(canTransition("waiting_for_image", "searching"), true, "canTransition");
});

check("resetShoppingState clears back to waiting_for_image", async () => {
  const state = createInitialState();
  await transition(state, "searching", { imageUrl: "u" });
  const reset = await resetShoppingState(state);
  eq(reset.step, "waiting_for_image", "step");
  eq(reset.imageUrl, undefined, "imageUrl");
});

// ---------------------------------------------------------------------------
section("2. Parsers");

check("parseSelection picks a number", () => {
  eq(parseSelection("2", 5), 1, "index");
  eq(parseSelection("pilih 3", 5), 2, "index");
  eq(parseSelection("nomor 1", 5), 0, "index");
});

check("parseSelection rejects out-of-range", () => {
  eq(parseSelection("9", 5), null, "index");
  eq(parseSelection("bukan angka", 5), null, "index");
});

check("parseQuantity parses plain numbers", () => {
  eq(parseQuantity("2"), 2, "qty");
  eq(parseQuantity("mau 3 pcs"), 3, "qty");
  eq(parseQuantity("banyak"), null, "qty");
});

check("parseAddress detects a postal code", () => {
  const addr = parseAddress("Jl. Kemang Raya No 5, Jakarta 12730");
  if (!addr) throw new Error("expected an address");
  if (!String(addr.kodePos).includes("12730")) {
    throw new Error(`kodePos mismatch: ${addr.kodePos}`);
  }
});

check("parseAddress returns null for non-address text", () => {
  eq(parseAddress("halo dunia"), null, "addr");
});

check("parseFilterCriteria extracts a max budget", () => {
  const c = parseFilterCriteria("maksimal 500rb");
  if (!c) throw new Error("expected criteria");
  if (c.maxPrice > 600000 || c.maxPrice < 400000) {
    throw new Error(`maxPrice out of range: ${c.maxPrice}`);
  }
});

check("isRestartIntent detects restart commands", () => {
  eq(isRestartIntent("mulai ulang"), true, "restart");
  eq(isRestartIntent("batal"), true, "restart");
  eq(isRestartIntent("cari hp"), false, "restart");
});

check("isPaymentConfirmation detects confirmations", () => {
  eq(isPaymentConfirmation("oke"), true, "confirm");
  eq(isPaymentConfirmation("ya"), true, "confirm");
  eq(isPaymentConfirmation("bayar"), true, "confirm");
  eq(isPaymentConfirmation("harga berapa"), false, "confirm");
});

// ---------------------------------------------------------------------------
section("3. Fee calculator (tiered 2% → 0.75%)");

check("tier 1: 25.000 → 2%", () => {
  const r = hitungBiayaLayanan(25000);
  eq(r.persen, 2, "persen");
  eq(r.biaya, 500, "biaya");
  eq(r.total, 25500, "total");
});

check("tier 2: 100.000 → 1.5%", () => {
  const r = hitungBiayaLayanan(100000);
  eq(r.persen, 1.5, "persen");
  eq(r.biaya, 1500, "biaya");
  eq(r.total, 101500, "total");
});

check("tier 3: 750.000 → 1%", () => {
  const r = hitungBiayaLayanan(750000);
  eq(r.persen, 1, "persen");
  eq(r.biaya, 7500, "biaya");
  eq(r.total, 757500, "total");
});

check("tier 4: 2.000.000 → 0.75%", () => {
  const r = hitungBiayaLayanan(2000000);
  eq(r.persen, 0.75, "persen");
  eq(r.biaya, 15000, "biaya");
  eq(r.total, 2015000, "total");
});

check("minimum transaction Rp1.000 is enforced", () => {
  let threw = false;
  try {
    hitungBiayaLayanan(500);
  } catch (e) {
    threw = true;
    if (!String(e.message).includes("1.000")) {
      throw new Error(`unexpected message: ${e.message}`);
    }
  }
  eq(threw, true, "threw");
});

// ---------------------------------------------------------------------------
section("4. Product filter");

const sampleProducts = [
  { id: "1", title: "HP Samsung A54", price: 3590000, rating: 4.8 },
  { id: "2", title: "Case HP Murah", price: 15000, rating: 4.1 },
  { id: "3", title: "Charger HP", price: 85000, rating: 4.5 },
  { id: "4", title: "Headset Bluetooth", price: 250000, rating: 4.6 },
];

check("applyFilter by maxPrice keeps only affordable items", () => {
  const filtered = applyFilter(sampleProducts, { maxPrice: 300000 });
  if (filtered.length !== 3) {
    throw new Error(`expected 3 results, got ${filtered.length}`);
  }
  if (filtered.some((p) => p.price > 300000)) {
    throw new Error("filter leaked an over-budget product");
  }
});

check("applyFilter by minPrice drops cheap items", () => {
  const filtered = applyFilter(sampleProducts, { minPrice: 100000 });
  if (filtered.some((p) => p.price < 100000)) {
    throw new Error("filter leaked an under-budget product");
  }
});

check("applyFilter with no criteria returns all products", () => {
  const filtered = applyFilter(sampleProducts, {});
  eq(filtered.length, sampleProducts.length, "length");
});

// ---------------------------------------------------------------------------
section("5. Full flow simulation (no external APIs)");

check("flow: image → selection → filter → quantity → address", async () => {
  const state = createInitialState();

  // Step 1: image arrives
  await transition(state, "searching", { imageUrl: "http://x/p.jpg" });
  const afterSearch = await transition(state, "waiting_for_product_selection", {
    productCandidates: sampleProducts,
    selectedProductIndex: 0,
  });
  eq(afterSearch.state.step, "waiting_for_product_selection", "step");
  eq(afterSearch.state.productCandidates.length, 4, "candidate count");

  // Step 2: user picks product #2
  const afterPick = await writeShoppingState(state, {
    selectedProductIndex: 1,
    step: "waiting_for_filter",
  });
  eq(afterPick.selectedProductIndex, 1, "index");

  // Step 3: filter applied
  const afterFilter = await writeShoppingState(state, {
    productCandidates: applyFilter(sampleProducts, { maxPrice: 300000 }),
    step: "waiting_for_quantity",
  });
  eq(afterFilter.productCandidates.length, 3, "filtered count");

  // Step 4: quantity
  const afterQty = await writeShoppingState(state, {
    quantity: 2,
    step: "waiting_for_address",
  });
  eq(afterQty.quantity, 2, "quantity");

  // Step 5: address
  const afterAddr = await writeShoppingState(state, {
    userAddress: { nama: "Budi", alamat: "Jl. Kemang", kodePos: "12730" },
    step: "calculating_shipping",
  });
  eq(afterAddr.userAddress?.kodePos, "12730", "kodePos");
  eq(afterAddr.step, "calculating_shipping", "step");

  // State survives a "new request" (session store semantics)
  const reread = await readShoppingState(state);
  eq(reread.quantity, 2, "persisted quantity");
  eq(reread.userAddress?.kodePos, "12730", "persisted address");
});

// ---------------------------------------------------------------------------
section("6. Live server check");

const port = process.env.PORT || "3000";
const base = `http://localhost:${port}`;

async function liveCheck() {
  const results = [];
  for (const [path, label] of [
    ["/komunitas-ai/api/v1/zeta/status", "zeta status route"],
    ["/komunitas-ai/webhook/waha/zeta", "zeta webhook route"],
  ]) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: path.includes("webhook") ? "POST" : "GET",
        headers: { "content-type": "application/json" },
        body: path.includes("webhook")
          ? JSON.stringify({ event: "message", payload: { from: "628555@c.us", body: "hi" } })
          : undefined,
        signal: AbortSignal.timeout(8000),
      });
      results.push({ label, ok: res.ok, status: res.status });
    } catch (error) {
      results.push({ label, ok: false, status: error.message });
    }
  }
  return results;
}

const live = await liveCheck();
for (const r of live) {
  if (r.ok) {
    pass += 1;
    console.log(`  ✓ ${r.label} → ${r.status}`);
  } else {
    fail += 1;
    failures.push({ name: r.label, message: String(r.status) });
    console.log(`  ✗ ${r.label} → ${r.status}`);
  }
}

// ---------------------------------------------------------------------------
console.log(`\n${"─".repeat(50)}`);
console.log(`Result: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  • ${f.name}: ${f.message}`);
  process.exitCode = 1;
} else {
  console.log("✓ All Zeta checks passed");
}
