from typing import Literal

from pydantic import BaseModel, Field


class RegisterIn(BaseModel):
    role: Literal["lock", "key"]
    name: str = Field(min_length=1, max_length=60)


class PairClaimIn(BaseModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class VerifyIn(BaseModel):
    sequence: str = Field(min_length=1, max_length=64)


class BiometricIn(BaseModel):
    biometric_verified: bool


from typing import Optional


class SettingsPatch(BaseModel):
    challenge_ttl_seconds: Optional[int] = Field(None, ge=30, le=120)
    long_press_ms: Optional[int] = Field(None, ge=150, le=1000)
    idle_timeout_seconds: Optional[int] = Field(None, ge=2, le=15)
