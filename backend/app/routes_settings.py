from fastapi import APIRouter, Depends

from .deps import any_dev, cfg, db, key_dev
from .schemas import SettingsPatch

router = APIRouter()


def settings_of(row):
    return {
        "challenge_ttl_seconds": row["ttl_seconds"],
        "long_press_ms": row["long_press_ms"],
        "idle_timeout_seconds": row["idle_timeout_seconds"],
    }


@router.get("/settings")
def get_settings(dev=Depends(any_dev)):
    if dev["role"] == "key":
        return settings_of(dev)
    pairing = db.one("SELECT key_id FROM pairings WHERE lock_id=?", (dev["id"],))
    if not pairing:
        return {"challenge_ttl_seconds": cfg.default_ttl, "long_press_ms": 250,
                "idle_timeout_seconds": 5}
    return settings_of(db.one("SELECT * FROM devices WHERE id=?", (pairing["key_id"],)))


@router.patch("/settings")
def patch_settings(body: SettingsPatch, key=Depends(key_dev)):
    columns = {
        "ttl_seconds": body.challenge_ttl_seconds,
        "long_press_ms": body.long_press_ms,
        "idle_timeout_seconds": body.idle_timeout_seconds,
    }
    for col, val in columns.items():
        if val is not None:
            db.run(f"UPDATE devices SET {col}=? WHERE id=?", (val, key["id"]))
    return settings_of(db.one("SELECT * FROM devices WHERE id=?", (key["id"],)))


@router.get("/history")
def history(limit: int = 50, key=Depends(key_dev)):
    limit = max(1, min(limit, 200))
    rows = db.all(
        "SELECT e.ts, e.event, e.detail, e.challenge_id, d.name AS lock_name "
        "FROM events e LEFT JOIN devices d ON d.id=e.lock_id "
        "WHERE e.key_id=? ORDER BY e.ts DESC, e.id DESC LIMIT ?", (key["id"], limit))
    return {"events": [dict(r) for r in rows]}
