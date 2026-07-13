# Kiwi Command Backend

FastAPI simulation that owns garage state when the frontend has `NEXT_PUBLIC_USE_BACKEND=true`.

## This is not a Node app

There is **no** `package.json` in this folder. Do **not** run:

```bash
npm run dev   # wrong — will fail with ENOENT package.json
```

## Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run

For day-to-day use, prefer **no auto-reload** (more stable — avoids WatchFiles restart loops):

```bash
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Only use `--reload` while actively editing backend Python:

```bash
python3 -m uvicorn app.main:app --reload --port 8000
```

`--reload` restarts when files under `backend/` change. On iCloud Desktop that can thrash and kill the server (`zsh: killed`). That is not an app crash from your demo code.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health + counts |
| GET | `/health` | Lightweight health |
| GET | `/api/state` | Current system snapshot |
| POST | `/api/demo/start` | Start autonomous demo |
| POST | `/api/demo/pause` | Pause demo |
| POST | `/api/demo/resume` | Resume demo |
| POST | `/api/demo/end` | End demo |
| POST | `/api/demo/reset` | Reset to idle baseline |
| POST | `/api/jobs` | Request charge (`{ "vehicle_id": "EV-XXXX" }`) — idempotent |
| POST | `/api/dispatch/{vehicle_id}` | Manual dispatch |
| POST | `/api/robots/{id}/fault` | Simulate robot fault |
| POST | `/api/robots/{id}/clear-fault` | Clear fault |
| POST | `/api/garage/lane-block` | Toggle lane block |
| POST | `/api/dispatch/toggle` | Toggle auto/manual dispatch |
| WS | `/ws/telemetry` | Live state stream |

## Frontend

```bash
# terminal 1 — from backend/
python3 -m uvicorn app.main:app --reload --port 8000

# terminal 2 — from frontend/
npm run dev
```
