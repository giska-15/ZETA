-- =============================================================================
-- ZETA DATABASE MIGRATION
-- Version: 1.0
-- Description: Schema for Zeta WhatsApp Shopping Bot
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- USERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wa_jid VARCHAR(255) UNIQUE NOT NULL,
    nama VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_wa_jid ON users(wa_jid);

-- =============================================================================
-- SESSIONS TABLE (State Machine)
-- =============================================================================
CREATE TYPE session_state AS ENUM (
    'IDLE',
    'AWAITING_PHOTO',
    'AWAITING_PRODUCT_CHOICE',
    'AWAITING_PRICE_RANGE',
    'AWAITING_CONFIRMATION',
    'AWAITING_PAYMENT',
    'PROCESSING_CHECKOUT',
    'DONE',
    'FAILED'
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state session_state NOT NULL DEFAULT 'IDLE',
    context JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_state ON sessions(state);

-- =============================================================================
-- PRODUCT SEARCHES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS product_searches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    photo_url TEXT,
    raw_vision_result JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_searches_user_id ON product_searches(user_id);

-- =============================================================================
-- PRODUCT CANDIDATES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS product_candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    search_id UUID NOT NULL REFERENCES product_searches(id) ON DELETE CASCADE,
    nama VARCHAR(500) NOT NULL,
    harga NUMERIC(15, 2) NOT NULL,
    rating NUMERIC(3, 2),
    url_shopee TEXT NOT NULL,
    gambar_url TEXT,
    toko VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_candidates_search_id ON product_candidates(search_id);

-- =============================================================================
-- ORDERS TABLE
-- =============================================================================
CREATE TYPE order_status AS ENUM (
    'PENDING_PAYMENT',
    'PAID',
    'CHECKOUT_IN_PROGRESS',
    'CHECKOUT_SUCCESS',
    'CHECKOUT_FAILED',
    'REFUNDED'
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES product_candidates(id),
    jumlah INTEGER NOT NULL DEFAULT 1,
    subtotal NUMERIC(15, 2) NOT NULL,
    ongkir NUMERIC(15, 2) DEFAULT 0,
    biaya_layanan NUMERIC(15, 2) DEFAULT 0,
    total NUMERIC(15, 2) NOT NULL,
    kurir VARCHAR(100),
    metode_bayar VARCHAR(50),
    status order_status NOT NULL DEFAULT 'PENDING_PAYMENT',
    doku_invoice_id VARCHAR(255),
    qris_url TEXT,
    shopee_order_id VARCHAR(255),
    screenshot_bukti_path TEXT,
    failure_reason TEXT,
    destination_city_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_doku_invoice_id ON orders(doku_invoice_id);

-- =============================================================================
-- FEE LOGS TABLE (Audit Trail)
-- =============================================================================
CREATE TABLE IF NOT EXISTS fee_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    subtotal NUMERIC(15, 2) NOT NULL,
    persen_dipakai NUMERIC(5, 2) NOT NULL,
    biaya NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fee_logs_order_id ON fee_logs(order_id);

-- =============================================================================
-- AUDIT LOGS TABLE (Playwright Step Tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    step VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    payload JSONB DEFAULT '{}',
    screenshot_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_order_id ON audit_logs(order_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- =============================================================================
-- Verify Tables Created
-- =============================================================================
-- SELECT tablename FROM pg_tables 
-- WHERE schemaname = 'public' 
-- ORDER BY tablename;
