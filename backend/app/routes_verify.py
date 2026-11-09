import hmac
import math

from fastapi import APIRouter, Depends, HTTPException

from .deps import cfg, db, lock_dev, log, now
from .routes_access import lock_state, refresh
from .schemas import VerifyIn

router = APIRouter()

SYMBOLS = {"·": ".", "•": ".", "−": "-", "–": "-", "—": "-"}


def normalize(raw):
    seq = "".join(SYMBOLS.get(c, c) for c in raw if not c.isspace())
    if not seq or any(c not in ".-" for c in seq):
        raise HTTPException(422, "sequence may only contain '.' (short) and '-' (long)")
    return seq


@router.post("/access/{rid}/verify")
def verify(rid: str, body: VerifyIn, lock=Depends(lock_dev)):
    seq = normalize(body.sequence)
    with db.tx():
        ch = db.one("SELECT * FROM challenges WHERE id=?", (rid,))
        if not ch:
            raise HTTPException(404, "Unknown access request")
        if ch["lock_id"] != lock["id"]:
            raise HTTPException(403, "Not your access request")
        ch = refresh(ch)
        t = now()
        ls = lock_state(lock["id"])

        if ls["lockout_until"] > t:
            return {"result": "locked_out", "retry_after": math.ceil(ls["lockout_until"] - t)}
        if ch["status"] == "expired":
            return {"result": "expired"}
        if ch["status"] != "pending":
            return {"result": "not_pending", "status": ch["status"]}

        attempts = ch["attempts"] + 1

        if hmac.compare_digest(ch["sequence"], seq):
            db.run("UPDATE challenges SET status='used', method='morse', attempts=?, resolved_at=? WHERE id=?",
                   (attempts, t, rid))
            db.run("UPDATE lock_state SET lockout_count=0 WHERE lock_id=?", (lock["id"],))
            log(lock["id"], ch["key_id"], rid, "unlocked", "morse")
            return {"result": "unlocked", "method": "morse"}

        log(lock["id"], ch["key_id"], rid, "wrong_attempt", f"{attempts}/{cfg.max_attempts}")

        if attempts >= cfg.max_attempts:
            count = ls["lockout_count"] + 1
            secs = min(cfg.lockout_base_seconds * 2 ** (count - 1), cfg.lockout_max_seconds)
            db.run("UPDATE challenges SET status='failed', attempts=?, resolved_at=? WHERE id=?",
                   (attempts, t, rid))
            db.run("UPDATE lock_state SET lockout_until=?, lockout_count=? WHERE lock_id=?",
                   (t + secs, count, lock["id"]))
            log(lock["id"], ch["key_id"], rid, "lockout", f"{secs}s")
            return {"result": "locked_out", "retry_after": secs}

        db.run("UPDATE challenges SET attempts=? WHERE id=?", (attempts, rid))
        return {"result": "wrong", "attempts_left": cfg.max_attempts - attempts}
