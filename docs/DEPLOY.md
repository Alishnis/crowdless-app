# Running it

There is no live backend deployment right now (the previous hosted demo was taken offline). Only the frontend is deployed, see below. A recorded walkthrough is on YouTube: <https://youtu.be/KVGqaX-Dgsg>.

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

## Frontend on GitHub Pages (free)

Only the static React/Vite frontend is deployed; the YOLO detection backend is intentionally not hosted. Pages that need it (the lab, the monitor camera feed, video upload) show a "Backend offline" message; the landing page, the simulated bus map and the passenger map work without it.

The workflow `.github/workflows/deploy-pages.yml` builds the app with `VITE_BASE=/crowdless-app/` (the site lives at `https://alishnis.github.io/crowdless-app/`) and copies `index.html` to `404.html` so deep links such as `/lab` and `/monitor` work on refresh.

1. One time: GitHub -> Settings -> Pages -> Source: **GitHub Actions**.
2. Optional: add the repository secret `VITE_GOOGLE_MAPS_API_KEY` (Settings -> Secrets and variables -> Actions) with a NEW Google Maps JavaScript API key, restricted by HTTP referrer to `https://alishnis.github.io/*`. It is shipped to browsers in the JS bundle, so never reuse a key that is not referrer-restricted. Without it the map page shows a load error; the other pages still work.
3. Leave `VITE_API_URL` unset. There is no backend to point at.
4. Run the workflow (Actions -> "Deploy frontend to GitHub Pages" -> Run workflow), or push to `main`.

`VITE_BASE` defaults to `/`, so `npm run dev` and a root-level host such as Vercel are unaffected (`vercel.json` is kept for that case).

## Legacy deployment files

`aci-deploy.yaml` (a container-group manifest), `Dockerfile.backend`, `Dockerfile.frontend` and `nginx.conf` were used for the former hosted deployment. They are kept as reference and are not maintained as a supported deployment path. Both Dockerfiles can still be built with `docker build -f <Dockerfile> .` if you want to self-host.

The backend Dockerfile copies a `live_demo/` folder, which is git-ignored, so create it (with one short clip) before building.

## CORS

By default the backend accepts requests from any origin. If you host the frontend somewhere else, set `CORS_ORIGINS` (comma-separated origins) on the backend and `VITE_API_URL` (the backend's URL) when building the frontend.
