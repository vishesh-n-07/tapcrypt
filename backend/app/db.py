import sqlite3
import threading
from contextlib import contextmanager

SCHEMA = """
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('lock','key')),
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at REAL NOT NULL,
    ttl_seconds INTEGER NOT NULL,
    long_press_ms INTEGER NOT NULL DEFAULT 250,
    idle_timeout_seconds INTEGER NOT NULL DEFAULT 5
);
CREATE TABLE IF NOT EXISTS pairings (
    lock_id TEXT PRIMARY KEY REFERENCES devices(id),
    key_id TEXT NOT NULL REFERENCES devices(id),
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS pair_codes (
    code TEXT PRIMARY KEY,
    key_id TEXT NOT NULL REFERENCES devices(id),
    expires_at REAL NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS challenges (
    id TEXT PRIMARY KEY,
    lock_id TEXT NOT NULL REFERENCES devices(id),
    key_id TEXT NOT NULL REFERENCES devices(id),
    sequence TEXT NOT NULL,
    created_at REAL NOT NULL,
    expires_at REAL NOT NULL,
    status TEXT NOT NULL,
    method TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    resolved_at REAL
);
CREATE TABLE IF NOT EXISTS lock_state (
    lock_id TEXT PRIMARY KEY REFERENCES devices(id),
    lockout_until REAL NOT NULL DEFAULT 0,
    lockout_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    lock_id TEXT,
    key_id TEXT,
    challenge_id TEXT,
    event TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
);
"""


class Database:
    def __init__(self, path):
        self.conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.executescript(SCHEMA)

    def one(self, sql, params=()):
        with self._lock:
            return self.conn.execute(sql, params).fetchone()

    def all(self, sql, params=()):
        with self._lock:
            return self.conn.execute(sql, params).fetchall()

    def run(self, sql, params=()):
        with self._lock:
            return self.conn.execute(sql, params)

    @contextmanager
    def tx(self):
        with self._lock:
            self.conn.execute("BEGIN IMMEDIATE")
            try:
                yield
            except BaseException:
                self.conn.execute("ROLLBACK")
                raise
            else:
                self.conn.execute("COMMIT")
