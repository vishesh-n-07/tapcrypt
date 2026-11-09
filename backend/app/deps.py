import hashlib
import time
from typing import Optional

from fastapi import Header, HTTPException

from .config import Settings
from .db import Database

cfg = Settings()
db = Database(cfg.db_path)


def now():
    return time.time()


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def log(lock_id, key_id, challenge_id, event, detail=""):
    db.run(
        "INSERT INTO events(ts, lock_id, key_id, challenge_id, event, detail) VALUES (?,?,?,?,?,?)",
        (now(), lock_id, key_id, challenge_id, event, detail),
    )


def _auth(role=None):
    def dep(authorization: Optional[str] = Header(default=None)):
        if not authorization or not authorization.lower().startswith("bearer "):
            raise HTTPException(401, "Missing bearer token")
        row = db.one("SELECT * FROM devices WHERE token_hash=?",
                     (hash_token(authorization[7:].strip()),))
        if not row:
            raise HTTPException(401, "Invalid token")
        if role and row["role"] != role:
            raise HTTPException(403, f"This endpoint requires a {role} device")
        return row
    return dep


any_dev = _auth()
lock_dev = _auth("lock")
key_dev = _auth("key")
