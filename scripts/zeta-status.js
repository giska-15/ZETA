#!/usr/bin/env node

/**
 * Quick health check for a running Zeta instance.
 *
 * Usage:
 *   node scripts/zeta-status.js                 # http://localhost:3000
 *   node scripts/zeta-status.js http://host:port
 */

import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");

function readEnvPort() {
  if (!existsSync(envPath)) return "3000";
  const content = readFileSync(envPath, "utf8");
  const match = content.match(/^\s*PORT\s*=\s*(\S+)/m);
  return match ? match[1] : "3000";
}

const base =
  process.argv[2] || `http://localhost:${readEnvPort()}`;

// ElizaOS prefixes every plugin route with "/<plugin.name>".
const PLUGIN_PREFIX = "/komunitas-ai";

async function check(path, label) {
  const url = `${base}${path}`;
  const isWebhook = path.includes("webhook");
  try {
    const res = await fetch(url, {
      method: isWebhook ? "POST" : "GET",
      headers: { "content-type": "application/json" },
      body: isWebhook
        ? JSON.stringify({
            event: "message",
            payload: { from: "628000000000@c.us", body: "ping" },
          })
        : undefined,
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    const ok = res.ok;
    console.log(
      `${ok ? "✓" : "✗"} ${label.padEnd(22)} ${res.status} ${res.statusText}`,
    );
    if (text) {
      const preview = text.length > 400 ? `${text.slice(0, 400)}…` : text;
      console.log(`  ${preview.replace(/\n/g, "\n  ")}`);
    }
    return { ok, res, text };
  } catch (err) {
    console.log(`✗ ${label.padEnd(22)} ${err.message}`);
    return { ok: false, res: null, text: "" };
  }
}

async function main() {
  console.log(`── Zeta status @ ${base} ──\n`);

  const health = await check("/health", "GET /health");
  console.log("");

  const status = await check(
    `${PLUGIN_PREFIX}/api/v1/zeta/status`,
    "GET zeta status",
  );
  console.log("");

  const webhook = await check(
    `${PLUGIN_PREFIX}/webhook/waha/zeta`,
    "POST zeta webhook",
  );
  console.log("");
  if (!webhook.ok) {
    console.log("! Zeta webhook is not reachable — check the WAHA config");
  }

  if (status.ok) {
    try {
      const parsed = JSON.parse(status.text);
      const features = parsed.features || {};
      console.log("Features:");
      for (const [name, enabled] of Object.entries(features)) {
        console.log(`  ${enabled ? "✓" : "·"} ${name}`);
      }
    } catch {
      // non-JSON body, ignore
    }
  }

  const ready = health.ok && status.ok;
  console.log("");
  console.log(ready ? "✓ Zeta is up" : "✗ Zeta is not fully reachable");
  if (!ready) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
