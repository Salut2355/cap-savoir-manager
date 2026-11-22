PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS school_settings (
    id TEXT PRIMARY KEY,
    school_name TEXT NOT NULL DEFAULT 'CAP SAVOIR',
    currency TEXT NOT NULL DEFAULT 'XOF',
    timezone TEXT NOT NULL DEFAULT 'Africa/Abidjan',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS levels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS tariff_versions (
    id TEXT PRIMARY KEY,
    level_id TEXT NOT NULL,
    monthly_amount INTEGER NOT NULL CHECK (monthly_amount >= 0),
    registration_amount INTEGER NOT NULL DEFAULT 2000
        CHECK (registration_amount >= 0),
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (level_id) REFERENCES levels(id),
    CHECK (
        effective_to IS NULL
        OR effective_to >= effective_from
    )
);

CREATE INDEX IF NOT EXISTS idx_tariffs_level_dates
ON tariff_versions(level_id, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL
        CHECK (role IN ('admin', 'finance', 'teacher')),
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);