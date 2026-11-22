CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    received_at TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL
        CHECK (payment_method IN (
            'cash', 'wave', 'orange_money',
            'mtn_money', 'moov_money', 'other'
        )),
    collection_status TEXT NOT NULL DEFAULT 'received'
        CHECK (collection_status IN ('pending', 'received')),
    notes TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_payments_student_date
ON payments(student_id, received_at);

CREATE TABLE IF NOT EXISTS payment_allocations (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL,
    billing_charge_id TEXT NOT NULL,
    amount_allocated INTEGER NOT NULL CHECK (amount_allocated > 0),
    created_at TEXT NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id),
    FOREIGN KEY (billing_charge_id) REFERENCES billing_charges(id),
    UNIQUE (payment_id, billing_charge_id)
);

CREATE INDEX IF NOT EXISTS idx_allocations_charge
ON payment_allocations(billing_charge_id);

CREATE TABLE IF NOT EXISTS paper_receipts (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL UNIQUE,
    paper_number TEXT,
    digital_reference TEXT NOT NULL UNIQUE,
    missing_number INTEGER NOT NULL DEFAULT 0
        CHECK (missing_number IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id),
    CHECK (
        (missing_number = 1 AND paper_number IS NULL)
        OR
        (missing_number = 0 AND paper_number IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_paper_number
ON paper_receipts(paper_number)
WHERE paper_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_refunds (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    refunded_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    payment_method TEXT NOT NULL
        CHECK (payment_method IN (
            'cash', 'wave', 'orange_money',
            'mtn_money', 'moov_money', 'other'
        )),
    created_by TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_refunds_payment
ON payment_refunds(payment_id);

CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    expense_date TEXT NOT NULL,
    beneficiary TEXT,
    payment_method TEXT
        CHECK (
            payment_method IS NULL
            OR payment_method IN (
                'cash', 'wave', 'orange_money',
                'mtn_money', 'moov_money', 'other'
            )
        ),
    status TEXT NOT NULL DEFAULT 'unpaid'
        CHECK (status IN ('unpaid', 'paid', 'cancelled')),
    notes TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    paid_at TEXT,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_expenses_date_status
ON expenses(expense_date, status);

CREATE TABLE IF NOT EXISTS other_inflows (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    received_at TEXT NOT NULL,
    source TEXT,
    payment_method TEXT NOT NULL
        CHECK (payment_method IN (
            'cash', 'wave', 'orange_money',
            'mtn_money', 'moov_money', 'other'
        )),
    notes TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_other_inflows_date
ON other_inflows(received_at);