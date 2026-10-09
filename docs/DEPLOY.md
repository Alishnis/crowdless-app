# Deploying on free hosting

| Part | Host | How |
|---|---|---|
| Backend (FastAPI + YOLO, port 8000) | Hugging Face Space, Docker SDK, free CPU | GitHub Actions, `.github/workflows/deploy-hf-space.yml` |
| Frontend (React/Vite, static) | Vercel | Git import, `vercel.json` |

`aci-deploy.yaml` (Azure Container Instances) is **legacy** and not used any more.

## 1. Hugging Face (backend)

1. Create an account at <https://huggingface.co>.
2. Create a **fine-grained access token** (Settings, Access Tokens) with **write** access to repos. Scoping it to the one Space is enough once the Space exists; for the first run, let it create repos under your user.
3. Pick a Space id `<hf-user>/<space-name>` (for example `yourname/crowdless`). The workflow creates the Space on its first run if it does not exist.
4. Register it in GitHub:

   ```bash
   gh secret set HF_TOKEN --repo Alishnis/crowdless-app          # paste the token when prompted
   gh variable set HF_SPACE_ID --repo Alishnis/crowdless-app --body <hf-user>/<space-name>
   ```

   Until `HF_SPACE_ID` is set the deploy job is skipped, so CI stays green.
5. Run it: GitHub, Actions, "Deploy backend to Hugging Face Space", Run workflow (it also runs on pushes to `main` that touch `backend/`, `models/`, `Dockerfile.backend` or `live_demo/`).
6. The first build installs CPU PyTorch and takes several minutes. Watch it on the Space's page.
7. **Demo clip (one time).** `live_demo/` is git-ignored (the promo clip is not redistributed through the repo), so CI cannot ship it. Upload it once from your machine; later deploys never delete it:

   ```bash
   pip install huggingface_hub
   hf upload <hf-user>/<space-name> live_demo/bus-passenger-counting-camera.mp4 \
       live_demo/bus-passenger-counting-camera.mp4 --repo-type space
   ```

   Or drag the file into `live_demo/` through the Space's "Files" tab. Without it `/analyze` and the sample picker are empty (uploads in `/lab` still work).
8. In the Space, Settings, "Variables and secrets", add the variable `CORS_ORIGINS` = your Vercel origin, for example `https://crowdless.vercel.app` (comma-separate several; no trailing path). Unset means any origin is allowed. No secret is needed by the backend.

Backend URL: `https://<hf-user>-<space-name>.hf.space` (check `/health`, docs at `/docs`).

Notes:
- Free Spaces sleep after about 48 hours without traffic and wake in roughly a minute on the next request, so the first page load after a pause is slow.
- The container runs as UID 1000 with an ephemeral disk: annotations saved through `POST /benchmarks` are lost on restart. The staged Dockerfile makes `benchmarks/` writable; everything else writes to `/tmp`.

Test the staging step locally without uploading anything:

```bash
python scripts/stage_hf_space.py build/hf_space   # then inspect build/hf_space
```

## 2. Vercel (frontend)

1. Sign in at <https://vercel.com> with GitHub, "Add New Project", import `Alishnis/crowdless-app`. Framework preset Vite is detected; `vercel.json` provides the build settings, the rewrite of every route (`/lab`, `/monitor`, ...) to `index.html`, and long-lived caching for hashed assets.
2. Under Environment Variables add (they are baked in at build time, so redeploy after changing them):
   - `VITE_API_URL` = `https://<hf-user>-<space-name>.hf.space` (no trailing slash)
   - `VITE_GOOGLE_MAPS_API_KEY` = a Google Maps JavaScript API **browser** key
3. **Restrict the Google key by HTTP referrer** (Google Cloud Console, Credentials, Application restrictions, Websites): add your Vercel domain (for example `https://crowdless.vercel.app/*`) and `http://localhost:5173/*` for development, and limit it to the Maps JavaScript API. The key is visible in the shipped JavaScript, so the restriction is what protects it.
4. Deploy, then put the resulting origin into `CORS_ORIGINS` on the Space (step 8 above).
5. Put the Vercel URL in the README (`Live demo: TODO(owner)`).
