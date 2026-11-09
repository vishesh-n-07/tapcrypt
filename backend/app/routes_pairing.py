import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException

from .deps import cfg, db, hash_token, key_dev, lock_dev, log, now
from .schemas import PairClaimIn, RegisterIn

router = APIRouter()

PAIR_CODE_TTL = 300
PAIR_FAIL_LIMIT = 5


@router.post("/devices/register", status_code=201)
def register(body: RegisterIn):
    device_id = uuid.uuid4().hex
    token = secrets.token_urlsafe(32)
    db.run(
        "INSERT INTO devices(id, role, name, token_hash, created_at, ttl_seconds) VALUES (?,?,?,?,?,?)",
        (device_id, body.role, body.name, hash_token(token), now(), cfg.default_ttl),
    )
    return {"device_id": device_id, "role": body.role, "token": token}


@router.post("/pair/code", status_code=201)
def create_pair_code(key=Depends(key_dev)):
    code = f"{secrets.randbelow(10**6):06d}"
    expires = now() + PAIR_CODE_TTL
    db.run("DELETE FROM pair_codes WHERE key_id=? AND used=0", (key["id"],))
    db.run("INSERT OR REPLACE INTO pair_codes(code, key_id, expires_at) VALUES (?,?,?)",
           (code, key["id"], expires))
    return {"code": code, "expires_at": expires}


@router.post("/pair/claim")
def claim_pair_code(body: PairClaimIn, lock=Depends(lock_dev)):
    t = now()
    fails = db.one(
        "SELECT COUNT(*) c FROM events WHERE lock_id=? AND event='pair_fail' AND ts>?",
        (lock["id"], t - 600))["c"]
    if fails >= PAIR_FAIL_LIMIT:
        raise HTTPException(429, "Too many invalid pairing codes. Try again later.")

    ok = False
    with db.tx():
        changed = db.run(
            "UPDATE pair_codes SET used=1 WHERE code=? AND used=0 AND expires_at>?",
            (body.code, t)).rowcount
        if changed:
            row = db.one("SELECT key_id FROM pair_codes WHERE code=?", (body.code,))
            key = db.one("SELECT * FROM devices WHERE id=?", (row["key_id"],))
            db.run("INSERT OR REPLACE INTO pairings(lock_id, key_id, created_at) VALUES (?,?,?)",
                   (lock["id"], key["id"], t))
            log(lock["id"], key["id"], None, "paired")
            ok = True

    if not ok:
        log(lock["id"], None, None, "pair_fail")
        raise HTTPException(400, "Invalid or expired pairing code")
    return {"paired": True, "key_id": key["id"], "key_name": key["name"]}
