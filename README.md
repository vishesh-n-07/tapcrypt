# TAPCRYPT

**Every Tap. A New Key.**

Dynamic smart access control using Morse-inspired touch authentication. Instead of a fixed PIN, every access request generates a fresh, time-limited, single-use sequence of short taps (dots) and long presses (dashes).

## How it works

1. The **Lock** app requests access.
2. The backend creates a random, single-use challenge.
3. The **Key** app shows the sequence with a countdown.
4. The user taps the sequence on the Lock.
5. The backend verifies it and authorizes the unlock.

## Features

- Fresh 8-symbol challenge for every request, expires in 30-120 s
- Single use, so replaying a code fails
- 5 wrong attempts trigger a lockout (60 s, doubling up to 5 min)
- Biometric fallback from the Key app
- Adjustable timing for accessibility
- Pairing with one-time codes
- Audit history

## Project structure
tapcrypt/
backend/ FastAPI + SQLite API
apps/lock/ Expo (React Native) Lock app
apps/key/ Expo Key app (planned)


## Run the backend (Windows PowerShell)
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000


Open http://127.0.0.1:8000/docs for the interactive API.

## Status

Conceptual design and MVP in progress.
- [x] Backend: pairing, challenges, verification, lockout, biometric fallback, settings, history
- [ ] Lock app
- [ ] Key app
- [ ] Hardware lock (ESP32)

## Tech

Python, FastAPI, SQLite, React Native, Expo, TypeScript
