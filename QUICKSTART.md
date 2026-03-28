# QUICKSTART

## 1) Install

```bash
npm install
```

## 2) Create Env Files

```bash
cp .env.example .env
cp .env.client.example .env.client
```

Server env (`.env`) minimum:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=mongodb://localhost:27017/sarva
JWT_SECRET=change-me
SERVE_CLIENT=false
CORS_ORIGIN=http://localhost:5173
```

Client env (`.env.client`) minimum:

```env
VITE_API_BASE_URL=http://localhost:3000
```

## 3) Run in Development (Separate Server + Client)

Terminal 1:

```bash
npm run dev:server
```

Terminal 2:

```bash
npm run dev:client
```

URLs:
- API: `http://localhost:3000`
- UI: `http://localhost:5173`

## 4) Build One Production-Ready Folder

PowerShell:

```powershell
.\build-separate-deploy.bat
```

The build auto-syncs environment templates into `production-ready` and appends any env keys detected from source code.

Optional with explicit domains:

```powershell
.\build-separate-deploy.bat production-ready https://api.yourdomain.com https://app.yourdomain.com
```

Generated output:

```text
production-ready/
├─ server/
├─ client/
├─ server-deploy.zip
└─ client-deploy.zip
```

Client runner scripts:
- From project root: `start-production-client.bat [port]`
- From generated client folder: `production-ready/client/start-client.bat [port]`

Both scripts:
- kill any process already listening on that port
- start client static hosting using `serve`

## 5) Deploy Separately

### Backend deployment

Use `production-ready/server` or `production-ready/server-deploy.zip`.

Steps:
1. Upload files.
2. Create `.env` from `.env.example`.
3. Keep `SERVE_CLIENT=false`.
4. Set `CORS_ORIGIN` to frontend URL.
5. Set `DATABASE_URL` and `JWT_SECRET`.
6. Run:

```bash
npm install
npm start
```

### Frontend deployment

Use `production-ready/client` or `production-ready/client-deploy.zip`.

Steps:
1. Upload static files.
2. Set `VITE_API_BASE_URL` to backend URL.
3. Configure SPA fallback to `/index.html`.

## 6) File Layout

Development source:

```text
src/
├─ server/
├─ client/
└─ shared/
```

Production output:

```text
production-ready/
├─ server/
└─ client/
```

## 7) Important Commands

```bash
npm run dev:server
npm run dev:client
npm run build:production
```

`build:production` runs `build-separate-deploy.bat`.
