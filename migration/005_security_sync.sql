CREATE TABLE IF NOT EXISTS device_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_name TEXT,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_device_sessions_user
ON device_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    old_values TEXT,
    new_values TEXT,
    reason TEXT,
    occurred_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_entity
ON audit_events(entity_type, entity_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_audit_user
ON audit_events(user_id, occurred_at);

CREATE TABLE IF NOT EXISTS sync_devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_name TEXT,
    last_sync_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sync_operations (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending', 'processing',
            'completed', 'conflict', 'failed'
        )),
    created_at TEXT NOT NULL,
    processed_at TEXT,
    FOREIGN KEY (device_id) REFERENCES sync_devices(id)
);

CREATE INDEX IF NOT EXISTS idx_sync_operations_status
ON sync_operations(status, created_at);

CREATE TABLE IF NOT EXISTS sync_conflicts (
    id TEXT PRIMARY KEY,
    sync_operation_id TEXT NOT NULL,
    local_version TEXT NOT NULL,
    remote_version TEXT NOT NULL,
    resolution TEXT
        CHECK (
            resolution IS NULL
            OR resolution IN ('local', 'remote', 'manual')
        ),
    resolved_by TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (sync_operation_id) REFERENCES sync_operations(id),
    FOREIGN KEY (resolved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS backups (
    id TEXT PRIMARY KEY,
    destination TEXT NOT NULL
        CHECK (destination IN ('local', 'google_drive', 'r2')),
    status TEXT NOT NULL
        CHECK (status IN ('pending', 'completed', 'failed')),
    file_name TEXT,
    checksum TEXT,
    file_size INTEGER CHECK (file_size IS NULL OR file_size >= 0),
    created_at TEXT NOT NULL,
    completed_at TEXT,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_backups_date
ON backups(created_at);