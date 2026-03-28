# SPARK AI Hosting And Deployment Guide

This guide prepares SPARK AI for the same style of deployment workflow used in the `tricore` reference project: a clear repo structure, explicit deployment entry scripts, and one generated `production-ready/` output for separate backend and frontend hosting.

## 1. Deployment Model

SPARK AI is deployed in two parts:

- backend API on a Node.js host
- frontend static build on a static hosting platform

This keeps the application easier to host, scale, and troubleshoot.

## 2. Deployment Entry Scripts

The repo now includes these top-level helpers:

- `run-app.bat`
  Starts local development using the existing app-control workflow.
- `build-deploy.bat`
  Creates production-ready deployment artifacts.
- `deploy-app.bat`
  Runs the deployment build and opens the generated output folder.
- `build-separate-deploy.bat`
  The underlying packaging script used by the wrappers above.

## 3. Repo Structure For Hosting

```text
SPARK AI/
├─ docs/
│  └─ HOSTING_DEPLOYMENT.md
├─ scripts/
│  ├─ prepare-runtime-package.cjs
│  └─ sync-deploy-env.ps1
├─ build-deploy.bat
├─ deploy-app.bat
├─ run-app.bat
├─ build-separate-deploy.bat
├─ .env.example
├─ .env.client.example
└─ production-ready/
   ├─ server/
   ├─ client/
   ├─ server-deploy.zip
   └─ client-deploy.zip
```

## 4. Build The Deployment Packages

From the repo root:

```bat
build-deploy.bat
```

Optional custom output and domains:

```bat
build-deploy.bat production-ready https://api.yourdomain.com https://app.yourdomain.com
```

The generated output includes:

- `production-ready/server/`
- `production-ready/client/`
- `production-ready/server-deploy.zip`
- `production-ready/client-deploy.zip`

## 5. Backend Hosting Steps

1. Upload `production-ready/server-deploy.zip` to your backend host.
2. Extract the package.
3. Create `.env` from `.env.example`.
4. Set at least:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `PORT`
   - `SERVE_CLIENT=false`
   - `CORS_ORIGIN=https://your-frontend-domain.com`
5. Run:

```bash
npm install
npm start
```

The backend package contains:

- compiled server code
- shared runtime files
- a minimal `package.json`
- a `server.js` entry point

## 6. Frontend Hosting Steps

1. Upload `production-ready/client-deploy.zip` to your static host.
2. Extract the package.
3. Create `.env.client` from `.env.client.example` if your host supports runtime env injection before build.
4. Ensure `VITE_API_BASE_URL` points to the deployed backend.
5. Configure your host to rewrite unknown routes to `/index.html`.

If you want to serve the generated client folder locally for testing:

```bat
start-production-client.bat 5173
```

Or from inside the generated client package:

```bat
start-client.bat 5173
```

## 7. Environment Templates

### Server template

Use `.env.example` as the base for backend hosting.

Important keys:

- `PORT`
- `NODE_ENV`
- `SERVE_CLIENT`
- `CORS_ORIGIN`
- `DATABASE_URL`
- `JWT_SECRET`
- `SMTP_*`
- `RAZORPAY_*`

### Client template

Use `.env.client.example` as the base for frontend builds.

Important keys:

- `VITE_API_BASE_URL`
- `VITE_API_URL`
- branding and print-related `VITE_*` values

The deployment packaging step automatically syncs both templates and appends env keys referenced by the source.

## 8. Local Validation Before Hosting

Run these checks before creating a deployment package:

```bash
npm run build:server
npm run build:client
```

Recommended smoke checks after deployment:

1. login
2. product list load
3. customer list load
4. quotation screen load
5. sales invoice creation
6. report screen load

## 9. Operational Notes

- `production-ready/` is generated and not committed to git.
- `dist/`, logs, backups, and installer output are also local-only.
- SPARK AI’s current hosting workflow avoids online sales storefront deployment and focuses on the business application itself.
