# Zeta — Panduan Menjalankan

Panduan lengkap untuk menjalankan Zeta — Asisten Belanja WhatsApp.

## Prerequisites

Pastikan kamu sudah install:
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (untuk Windows/Mac) atau Docker Engine (Linux)
- [Node.js 18+](https://nodejs.org/)
- [Git](https://git-scm.com/)

## Langkah 1: Clone & Setup

```bash
# Clone repository
git clone https://github.com/03ntity/KomunitasAI.git zeta
cd zeta

# Install dependencies
npm install --legacy-peer-deps --ignore-scripts

# Copy environment file
cp .env.example .env
```

## Langkah 2: Konfigurasi Environment

Edit file `.env` dan isi variabel berikut:

### Wajib Diisi:

```env
# AI Provider (minimal 1)
OPENROUTER_API_KEY=your_openrouter_key  # Gratis dengan Gemini

# Database
POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/zeta

# WAHA (WhatsApp)
WAHA_API_KEY=secret
WAHA_SESSION=default

# DOKU Payment (Production)
DOKU_CLIENT_ID=your_client_id
DOKU_SECRET_KEY=your_secret_key
DOKU_AUTHORIZATION=your_authorization
DOKU_IS_PRODUCTION=true
DOKU_MCP_API_KEY=your_mcp_key

# RajaOngkir (Ongkir)
RAJAONGKIR_API_KEY=your_rajaongkir_key
RAJAONGKIR_ORIGIN_CITY_ID=501  # Jakarta Pusat
```

### Opsional (untuk Visual Search):

```env
# Google Vision Product Search
GOOGLE_VISION_PROJECT_ID=your-project
GOOGLE_VISION_LOCATION=us-central1
GOOGLE_VISION_PRODUCT_SET_ID=your-product-set-id

# Atau Apify (fallback)
APIFY_TOKEN=your_apify_token
```

## Langkah 3: Jalankan Docker Services

```bash
# Jalankan PostgreSQL + WAHA
docker compose up -d postgres waha

# Tunggu sampai healthy
docker ps
```

## Langkah 4: Setup Database

```bash
# Buat database (jika perlu)
docker exec -it zeta-postgres psql -U postgres -c "CREATE DATABASE zeta;"

# Buat tabel (lihat Fase 2 untuk schema)
# Atau jalankan migration jika sudah ada
```

## Langkah 5: Login Shopee (Sekali Saja)

```bash
# Login ke Shopee agar session tersimpan
npm run shopee:login
```

Browser akan terbuka. Login ke akun Shopee kamu, lalu tutup browser. Session akan tersimpan di `./shopee-profile`.

## Langkah 6: Jalankan Bot

```bash
# Mode development
npm run dev

# Mode production
npm start
```

## Langkah 7: Scan QR WhatsApp

1. Buka WAHA dashboard di http://localhost:3001
2. Login dengan API key `secret`
3. Scan QR code dengan WhatsApp
4. Sekarang bot siap menerima pesan!

## Troubleshooting

### Checkout Gagal di Step X

1. Cek screenshot di folder: `./logs/shopee/<orderId>/`
2. Setiap step otomatis di-screenshot dan disimpan
3. Identifikasi step yang gagal dan lihat screenshot

### Sesi Shopee Expired

```bash
# Jalankan login ulang
npm run shopee:login
```

### Pembayaran DOKU Gagal

1. Pastikan `DOKU_IS_PRODUCTION=true` untuk production
2. Cek credentials di DOKU Back Office
3. Cek logs di `./logs/`

### Bot Tidak Merespons

1. Cek apakah WAHA sudah running: `docker ps`
2. Cek logs bot: lihat terminal
3. Pastikan WAHA_WEBHOOK_URL sudah benar

## Kustomisasi Nama Bot

Zeta bisa di-rename sesuai keinginan. Edit variabel di `.env`:

```env
BOT_NAME=Zeta           # Nama persona
BOT_PERSONA_TAGLINE=Asisten belanjamu di WhatsApp
```

Atau ubah langsung di kode:
- `src/character.ts` — nama dan system prompt
- `src/plugins/waha-client.ts` — pesan sapaan

## Struktur Folder

```
zeta/
├── src/
│   ├── actions/           # ElizaOS actions
│   ├── plugins/           # Service plugins
│   ├── services/          # Fee, Shipping, Vision, Shopee
│   └── orchestrator/      # State machine
├── shopee-profile/        # Playwright session
├── logs/                  # Audit logs
├── .env                   # Environment (jangan di-commit!)
└── docker-compose.yml     # Docker services
```

## Lisensi

MIT
