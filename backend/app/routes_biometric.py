from fastapi import APIRouter, Depends, HTTPException

from .deps import db, key_dev, log, now
from .routes_access import lock_state, refresh
from .schemas import BiometricIn

router = APIRouter()


@router.post("/access/{rid}/approve-biometric")
def approve_biometric(rid: str, body: BiometricIn, key=Depends(key_dev)):
    if not body.biometric_verified:
        raise HTTPException(400, "Biometric verification was not successful")
    with db.tx():
        ch = db.one("SELECT * FROM challenges WHERE id=?", (rid,))
        if not ch:
            raise HTTPException(404, "Unknown access request")
        if ch["key_id"] != key["id"]:
            raise HTTPException(403, "Not your access request")
        ch = refresh(ch)
        t = now()
        if ch["status"] not in ("pending", "failed") or t >= ch["expires_at"]:
            return {"result": "not_pending", "status": ch["status"]}
        db.run("UPDATE challenges SET status='used', method='biometric', resolved_at=? WHERE id=?",
               (t, rid))
        lock_state(ch["lock_id"])
        db.run("UPDATE lock_state SET lockout_until=0, lockout_count=0 WHERE lock_id=?",
               (ch["lock_id"],))
        log(ch["lock_id"], key["id"], rid, "unlocked", "biometric")
    return {"result": "unlocked", "method": "biometric"}
