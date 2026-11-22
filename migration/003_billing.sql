CREATE TABLE IF NOT EXISTS billing_cycles (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    tariff_version_id TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    amount_due INTEGER NOT NULL CHECK (amount_due >= 0),
    accounting_period TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (tariff_version_id) REFERENCES tariff_versions(id),
    CHECK (end_date >= start_date),
    UNIQUE (student_id, start_date)
);

CREATE INDEX IF NOT EXISTS idx_billing_cycles_student
ON billing_cycles(student_id, start_date);

CREATE INDEX IF NOT EXISTS idx_billing_cycles_period
ON billing_cycles(accounting_period);

CREATE TABLE IF NOT EXISTS billing_charges (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    enrolment_id TEXT,
    billing_cycle_id TEXT,
    charge_type TEXT NOT NULL
        CHECK (charge_type IN ('registration', 'monthly')),
    description TEXT NOT NULL,
    amount_due INTEGER NOT NULL CHECK (amount_due >= 0),
    due_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (enrolment_id) REFERENCES enrolments(id),
    FOREIGN KEY (billing_cycle_id) REFERENCES billing_cycles(id),
    CHECK (
        (charge_type = 'registration'
            AND enrolment_id IS NOT NULL
            AND billing_cycle_id IS NULL)
        OR
        (charge_type = 'monthly'
            AND billing_cycle_id IS NOT NULL
            AND enrolment_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_charges_student_due
ON billing_charges(student_id, due_date);

CREATE INDEX IF NOT EXISTS idx_charges_cycle
ON billing_charges(billing_cycle_id);

CREATE TABLE IF NOT EXISTS billing_adjustments (
    id TEXT PRIMARY KEY,
    billing_charge_id TEXT NOT NULL,
    adjustment_type TEXT NOT NULL
        CHECK (adjustment_type IN ('discount', 'exemption', 'correction')),
    amount INTEGER NOT NULL CHECK (amount >= 0),
    reason TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (billing_charge_id) REFERENCES billing_charges(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_adjustments_charge
ON billing_adjustments(billing_charge_id);