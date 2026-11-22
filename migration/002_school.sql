CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    level_id TEXT NOT NULL,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    FOREIGN KEY (level_id) REFERENCES levels(id)
);

CREATE INDEX IF NOT EXISTS idx_students_status
ON students(status);

CREATE INDEX IF NOT EXISTS idx_students_name
ON students(last_name, first_name);

CREATE TABLE IF NOT EXISTS guardians (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_guardians (
    student_id TEXT NOT NULL,
    guardian_id TEXT NOT NULL,
    relationship TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0
        CHECK (is_primary IN (0, 1)),
    PRIMARY KEY (student_id, guardian_id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (guardian_id) REFERENCES guardians(id)
);

CREATE TABLE IF NOT EXISTS enrolments (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    registration_fee INTEGER NOT NULL DEFAULT 2000
        CHECK (registration_fee >= 0),
    registration_exempted INTEGER NOT NULL DEFAULT 0
        CHECK (registration_exempted IN (0, 1)),
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students(id),
    CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_enrolments_student
ON enrolments(student_id, start_date);

CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    schedule TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_assignments (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (group_id) REFERENCES groups(id),
    CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_assignments_student_dates
ON group_assignments(student_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_assignments_group_dates
ON group_assignments(group_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    session_date TEXT NOT NULL,
    status TEXT NOT NULL
        CHECK (status IN ('planned', 'completed', 'cancelled')),
    notes TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    UNIQUE (group_id, session_date)
);

CREATE INDEX IF NOT EXISTS idx_sessions_date_status
ON sessions(session_date, status);

CREATE TABLE IF NOT EXISTS attendance_records (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    status TEXT NOT NULL
        CHECK (status IN ('present', 'absent', 'late', 'excused')),
    reason TEXT,
    recorded_by TEXT,
    recorded_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (recorded_by) REFERENCES users(id),
    UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_student
ON attendance_records(student_id, recorded_at);