import math

from fastapi import APIRouter, Depends, HTTPException

from .deps import db, key_dev, log, now
from .routes_access import lock_state

router = APIRouter()


@router.get("/locks")
def list_locks(key=Depends(key_dev)):
    t = now()
    rows = db.all(
        "SELECT d.id, d.name, p.created_at FROM pairings p "
        "JOIN devices d ON d.id=p.lock_id WHERE p.key_id=? ORDER BY d.name",
        (key["id"],))
    out = []
    for r in rows:
        ls = lock_state(r["id"])
        waiting = db.one(
            "SELECT COUNT(*) c FROM challenges WHERE lock_id=? AND status='pending' AND expires_at>?",
            (r["id"], t))["c"]
        out.append({
            "lock_id": r["id"],
            "name": r["name"],
            "paired_at": r["created_at"],
            "waiting": waiting > 0,
            "locked_out_seconds": max(0, math.ceil(ls["lockout_until"] - t)),
        })
    return {"locks": out}


@router.delete("/locks/{lock_id}")
def remove_lock(lock_id: str, key=Depends(key_dev)):
    with db.tx():
        p = db.one("SELECT * FROM pairings WHERE lock_id=? AND key_id=?", (lock_id, key["id"]))
        if not p:
            raise HTTPException(404, "Lock not found")
        db.run("DELETE FROM pairings WHERE lock_id=?", (lock_id,))
        db.run("UPDATE challenges SET status='cancelled', resolved_at=? "
               "WHERE lock_id=? AND status IN ('pending','failed')", (now(), lock_id))
        log(lock_id, key["id"], None, "lock_removed")
    return {"removed": True}
