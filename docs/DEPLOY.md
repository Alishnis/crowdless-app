# Running it

There is no live deployment right now. The former Azure live demo was taken offline when the student credit that paid for it ran out. A recorded walkthrough is on YouTube: <https://youtu.be/KVGqaX-Dgsg>.

## Run locally

Prerequisites: Python 3.11+ and Node.js 20.19+ / 22.12+. The full instructions are in the README's [Quick start](../README.md#quick-start); in short:

```bash
# Backend  (http://localhost:8000)
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --port 8000
curl localhost:8000/health

# Frontend, in a second terminal  (http://localhost:5173)
npm install
cp .env.example .env     # optional, see the README's Configuration section
npm run dev
```

The fine-tuned detector (`models/pamela_head.pt`) is committed, so no weight download or training run is needed.

## Legacy files (former Azure deployment)

`aci-deploy.yaml` (Azure Container Instances manifest), `Dockerfile.backend`, `Dockerfile.frontend` and `nginx.conf` were used for the former Azure deployment. They are kept as reference and are not maintained as a supported deployment path. Both Dockerfiles can still be built with `docker build -f <Dockerfile> .` if you want to self-host.

The backend Dockerfile copies a `live_demo/` folder, which is git-ignored, so create it (with one short clip) before building.

## CORS

By default the backend accepts requests from any origin. If you host the frontend somewhere else, set `CORS_ORIGINS` (comma-separated origins) on the backend and `VITE_API_URL` (the backend's URL) when building the frontend.
