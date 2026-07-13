# Kiwi Command

One-page operations dashboard for mobile EV charging robots (Kiwi Charge interview demo).

## Project layout

| Folder | What it is | How to run |
|--------|------------|------------|
| `frontend/` | Next.js 16 App Router dashboard | `npm run dev` |
| `backend/` | FastAPI simulation + WebSocket API | `uvicorn` (Python) |

**Do not run `npm run dev` inside `backend/`.** There is no `package.json` there — backend is Python only.

## Quick start

### 1. Backend (source of truth when enabled)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
# Prefer no --reload for a stable demo (avoids WatchFiles restart loops on iCloud Desktop)
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Health check: [http://localhost:8000/api/health](http://localhost:8000/api/health)

### 2. Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Frontend env (`frontend/.env.local`)

```
NEXT_PUBLIC_USE_BACKEND=true
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/telemetry
```

- `NEXT_PUBLIC_USE_BACKEND=true` — backend owns simulation; frontend only renders WebSocket state and calls REST actions.
- `NEXT_PUBLIC_USE_BACKEND=false` — frontend-only local simulation (no backend required).

## Common mistakes

1. Running `npm run dev` in `backend/` → `ENOENT package.json`. Use Uvicorn instead.
2. Starting only the frontend with `USE_BACKEND=true` → WebSocket/API failures. Start backend on port 8000 first.
3. Running both local and backend simulations — keep `USE_BACKEND` consistent; never run competing sims.

## Demo flow

1. Start backend, then frontend.
2. Click **Run Demo**.
3. Or select any parked car and click **Request Charge** in the selected job panel (or header **Request**). Both buttons share the same action.
4. High-SOC cars show a **not needed / deferred** reason instead of charging to 100%.

**After pulling backend changes:** restart Uvicorn (no `--reload`) so eligibility / target-battery updates load.