import math
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException

from .deps import any_dev, cfg, db, key_dev, lock_dev, log, now

router = APIRouter()

REQUEST_COOLDOWN = 2.0
REQUESTS_PER_MINUTE = 10


def lock_state(lock_id):
    db.run("INSERT OR IGNORE INTO lock_state(lock_id) VALUES (?)", (lock_id,))
    return db.one("SELECT * FROM lock_state WHERE lock_id=?", (lock_id,))


def refresh(ch):
    """Mark a pending challenge as expired if its time has run out."""
    if ch["status"] == "pending" and now() >= ch["expires_at"]:
        db.run("UPDATE challenges SET status='expired', resolved_at=? WHERE id=?",
               (now(), ch["id"]))
        log(ch["lock_id"], ch["key_id"], ch["id"], "expired")
        return db.one("SELECT * FROM challenges WHERE id=?", (ch["id"],))
    return ch


@router.post("/access/request", status_code=201)
def request_access(lock=Depends(lock_dev)):
    pairing = db.one("SELECT * FROM pairings WHERE lock_id=?", (lock["id"],))
    if not pairing:
        raise HTTPException(409, "Lock is not paired with a key")
    t = now()
    with db.tx():
        ls = lock_state(lock["id"])
        if ls["lockout_until"] > t:
            raise HTTPException(423, {"message": "Temporarily locked out",
                                      "retry_after": math.ceil(ls["lockout_until"] - t)})
        recent = [r["ts"] for r in db.all(
            "SELECT ts FROM events WHERE lock_id=? AND event='request' AND ts>?",
            (lock["id"], t - 60))]
        if recent and t - max(recent) < REQUEST_COOLDOWN:
            raise HTTPException(429, {"message": "Slow down"})
        if len(recent) >= REQUESTS_PER_MINUTE:
            raise HTTPException(429, {"message": "Too many requests"})

        # a new request cancels any older open challenge
        db.run("UPDATE challenges SET status='superseded', resolved_at=? "
               "WHERE lock_id=? AND status='pending'", (t, lock["id"]))

        key = db.one("SELECT * FROM devices WHERE id=?", (pairing["key_id"],))
        seq = "".join(secrets.choice(".-") for _ in range(cfg.sequence_length))
        rid = uuid.uuid4().hex
        expires = t + key["ttl_seconds"]
        db.run("INSERT INTO challenges(id, lock_id, key_id, sequence, created_at, expires_at, status) "
               "VALUES (?,?,?,?,?,?, 'pending')",
               (rid, lock["id"], key["id"], seq, t, expires))
        log(lock["id"], key["id"], rid, "request")
    return {"request_id": rid, "expires_at": expires, "ttl_seconds": key["ttl_seconds"],
            "sequence_length": cfg.sequence_length, "max_attempts": cfg.max_attempts}


@router.get("/access/pending")
def pending_for_key(key=Depends(key_dev)):
    rows = db.all("SELECT * FROM challenges WHERE key_id=? AND status IN ('pending','failed') "
                  "ORDER BY created_at DESC", (key["id"],))
    out = []
    for r in rows:
        r = refresh(r)
        if r["status"] not in ("pending", "failed") or r["expires_at"] <= now():
            continue
        lock = db.one("SELECT name FROM devices WHERE id=?", (r["lock_id"],))
        out.append({
            "request_id": r["id"],
            "lock_name": lock["name"], "status": r["status"],
            "sequence": r["sequence"] if r["status"] == "pending" else None,
            "pattern": (["short" if c == "." else "long" for c in r["sequence"]] if r["status"] == "pending" else None),
            "expires_at": r["expires_at"],
            "seconds_left": max(0, math.ceil(r["expires_at"] - now())),
        })
    return {"requests": out}


@router.get("/access/{rid}/status")
def status(rid: str, dev=Depends(any_dev)):
    ch = db.one("SELECT * FROM challenges WHERE id=?", (rid,))
    if not ch:
        raise HTTPException(404, "Unknown access request")
    owner = ch["lock_id"] if dev["role"] == "lock" else ch["key_id"]
    if owner != dev["id"]:
        raise HTTPException(403, "Not your access request")
    ch = refresh(ch)
    pending = ch["status"] == "pending"
    return {
        "request_id": ch["id"],
        "status": ch["status"],
        "unlocked": ch["status"] == "used",
        "method": ch["method"],
        "seconds_left": max(0, math.ceil(ch["expires_at"] - now())) if pending else 0,
        "attempts_used": ch["attempts"],
        "attempts_left": max(0, cfg.max_attempts - ch["attempts"]) if pending else 0,
    }

