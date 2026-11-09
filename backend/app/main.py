from fastapi import FastAPI

from .routes_access import router as access_router
from .routes_biometric import router as biometric_router
from .routes_pairing import router as pairing_router
from .routes_settings import router as settings_router
from .routes_verify import router as verify_router

app = FastAPI(title="TAPCRYPT Backend")
app.include_router(pairing_router)
app.include_router(access_router)
app.include_router(verify_router)
app.include_router(biometric_router)
app.include_router(settings_router)


@app.get("/health")
def health():
    return {"status": "ok"}
