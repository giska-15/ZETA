/**
 * Zeta Session Store
 *
 * Menyimpan state shopping per nomor WhatsApp.
 *
 * Kenapa perlu: setiap pesan WhatsApp masuk lewat HTTP request terpisah
 * (WAHA webhook), sehingga `State` dari ElizaOS tidak bertahan antar
 * request. Session store ini jadi sumber kebenaran untuk alur belanja.
 *
 * State per session juga disimpan ke `State` ElizaOS (via `syncToState`)
 * supaya provider & action tetap bisa membacanya di request yang sama.
 */

import {
  readShoppingState,
  writeShoppingState,
  resetShoppingState,
  createInitialState,
  STATE_KEY,
  type ShoppingState,
} from "./state-machine";

export interface ZetaSession {
  phone: string;
  state: ShoppingState;
  lastSeenAt: number;
  createdAt: number;
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 6; // 6 jam
const MAX_SESSIONS = 500;

const sessions = new Map<string, ZetaSession>();

/** Normalisasi nomor HP agar konsisten (62xxxxxxxxx) */
export function normalizePhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("62")) return digits;
  if (digits.length <= 10) return `62${digits}`;
  return digits;
}

/**
 * Ambil session untuk nomor HP. Membuat baru bila belum ada / kadaluarsa.
 */
export function getSession(phone: string): ZetaSession {
  const key = normalizePhone(phone);
  const now = Date.now();
  const existing = sessions.get(key);

  if (existing && now - existing.lastSeenAt < SESSION_TTL_MS) {
    existing.lastSeenAt = now;
    return existing;
  }

  const fresh: ZetaSession = {
    phone: key,
    state: createInitialState(),
    lastSeenAt: now,
    createdAt: existing?.createdAt ?? now,
  };
  sessions.set(key, fresh);
  evictIfNeeded();
  return fresh;
}

/**
 * Simpan perubahan state pada session.
 */
export function updateSession(
  phone: string,
  state: ShoppingState,
): ZetaSession {
  const key = normalizePhone(phone);
  const session = sessions.get(key) ?? {
    phone: key,
    state: createInitialState(),
    lastSeenAt: Date.now(),
    createdAt: Date.now(),
  };
  session.state = state;
  session.lastSeenAt = Date.now();
  sessions.set(key, session);
  evictIfNeeded();
  return session;
}

/**
 * Reset session ke awal.
 */
export function resetSession(phone: string): ZetaSession {
  const key = normalizePhone(phone);
  const session: ZetaSession = {
    phone: key,
    state: createInitialState(),
    lastSeenAt: Date.now(),
    createdAt: sessions.get(key)?.createdAt ?? Date.now(),
  };
  sessions.set(key, session);
  return session;
}

/**
 * Salin state session ke ElizaOS State (agar provider/action bisa akses).
 */
export async function syncToState(
  elizaState: any,
  phone: string,
): Promise<ShoppingState> {
  const session = getSession(phone);
  await writeShoppingState(elizaState, session.state);
  return session.state;
}

/**
 * Baca state dari ElizaOS State; jika kosong, pakai session store.
 */
export async function resolveState(
  elizaState: any,
  phone: string,
): Promise<ShoppingState> {
  const fromEliza = await readShoppingState(elizaState);
  const session = getSession(phone);

  // Kalau session punya data lebih baru (step berbeda & bukan default), pakai session
  if (
    session.state.step !== "waiting_for_image" &&
    fromEliza.step === "waiting_for_image"
  ) {
    return session.state;
  }

  // Sinkronkan session dengan state Eliza bila session masih default
  if (session.state.step === "waiting_for_image" && fromEliza.step !== "waiting_for_image") {
    updateSession(phone, fromEliza);
    return fromEliza;
  }

  return fromEliza;
}

/**
 * Reset session + state Eliza.
 */
export async function resetBoth(elizaState: any, phone: string): Promise<ShoppingState> {
  const fresh = resetSession(phone).state;
  await resetShoppingState(elizaState);
  await writeShoppingState(elizaState, fresh);
  return fresh;
}

/**
 * Buat objek state kompatibel (get/set) yang di-back oleh session store.
 * Dipakai agar `handleMessage()` dari shopping-flow bisa dipakai langsung
 * pada konteks WhatsApp tanpa HTTP session.
 */
export function createSessionState(phone: string): {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any) => Promise<any>;
} {
  return {
    async get(key: string) {
      const session = getSession(phone);
      if (key === STATE_KEY) return session.state;
      return undefined;
    },
    async set(key: string, value: any) {
      const session = getSession(phone);
      if (key === STATE_KEY) {
        session.state = { ...session.state, ...(value ?? {}) } as ShoppingState;
        session.lastSeenAt = Date.now();
      }
      return value;
    },
  };
}

/**
 * Buang session lama kalau kuota terlampaui.
 */
function evictIfNeeded(): void {
  if (sessions.size <= MAX_SESSIONS) return;

  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.lastSeenAt > SESSION_TTL_MS) {
      sessions.delete(key);
    }
  }

  if (sessions.size <= MAX_SESSIONS) return;

  const sorted = [...sessions.entries()].sort(
    (a, b) => a[1].lastSeenAt - b[1].lastSeenAt,
  );
  const toRemove = sessions.size - MAX_SESSIONS;
  for (let i = 0; i < toRemove; i++) {
    sessions.delete(sorted[i][0]);
  }
}

/** Jumlah session aktif (untuk monitoring/debug) */
export function activeSessionCount(): number {
  return sessions.size;
}
