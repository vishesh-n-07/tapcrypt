import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    db_path: str = os.getenv("TAPCRYPT_DB", "tapcrypt.db")
    sequence_length: int = 8
    default_ttl: int = 45
    max_attempts: int = 5
    lockout_base_seconds: int = 60
    lockout_max_seconds: int = 300
