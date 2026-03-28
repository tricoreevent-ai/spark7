# SPARK AI

SPARK AI is a multi-module business operations system for sports arena, retail, membership, booking, and finance workflows. It combines POS billing, product and inventory control, quotations, customer credit tracking, facilities, memberships, HR, accounting, reporting, and role-based administration in one application.

Key project docs:
- User manual: [USER_MANUAL.md](./USER_MANUAL.md)
- Hosting guide: [docs/HOSTING_DEPLOYMENT.md](./docs/HOSTING_DEPLOYMENT.md)
- Feature audit: [FEATURE_AUDIT.md](./FEATURE_AUDIT.md)

## Current Functional Scope

### Sales and customer operations
- POS billing and invoice creation
- orders and sales history
- quotations with approval and draft invoice conversion
- returns processing
- customer records with contact and credit controls

### Product and stock operations
- product entry and catalog management
- category management
- inventory visibility and stock adjustments
- stock alerts
- procurement, suppliers, and purchase orders

### Operations and people
- employees
- attendance
- shifts
- payroll
- facilities and bookings
- event bookings
- memberships and membership reports

### Finance and administration
- accounting workspace
- receipt and credit note settlement workflows
- reporting dashboards
- settings and branding
- user management and role permissions

## Architecture

### Frontend
- React
- Vite
- TypeScript
- React Router

### Backend
- Node.js
- Express
- MongoDB with Mongoose
- JWT authentication
- Nodemailer

### Desktop packaging
- Electron

## Project Structure

```text
SPARK AI/
├─ src/
│  ├─ client/
│  │  ├─ components/
│  │  ├─ hooks/
│  │  ├─ pages/
│  │  └─ utils/
│  ├─ desktop/
│  │  └─ main/
│  ├─ server/
│  │  ├─ middleware/
│  │  ├─ models/
│  │  ├─ routes/
│  │  ├─ services/
│  │  └─ utils/
│  └─ shared/
├─ docs/
├─ scripts/
├─ build-deploy.bat
├─ deploy-app.bat
├─ run-app.bat
├─ build-separate-deploy.bat
└─ USER_MANUAL.md
```

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create local env files from the templates:

```bash
copy .env.example .env
copy .env.client.example .env.client
```

3. Start the backend:

```bash
npm run dev:server
```

4. Start the frontend:

```bash
npm run dev:client
```

Windows shortcut:

```bat
run-app.bat
```

## Build and Deployment Workflow

SPARK AI now follows the same operator-friendly deployment shape used in the `tricore` reference workflow:
- one repo-level deployment guide
- one build entry point
- one deploy wrapper
- one run helper
- one generated `production-ready/` output with separate backend and frontend artifacts

### Build deployment packages

```bat
build-deploy.bat
```

Or with explicit backend and frontend URLs:

```bat
build-deploy.bat production-ready https://api.yourdomain.com https://app.yourdomain.com
```

### Deploy packages

```bat
deploy-app.bat
```

This produces:
- `production-ready/server/`
- `production-ready/client/`
- `production-ready/server-deploy.zip`
- `production-ready/client-deploy.zip`

### Generated deployment structure

```text
production-ready/
├─ server/
│  ├─ dist/server/
│  ├─ dist/shared/
│  ├─ package.json
│  ├─ server.js
│  ├─ .env.example
│  └─ DEPLOY_SERVER.txt
├─ client/
│  ├─ index.html
│  ├─ assets/
│  ├─ .env.client.example
│  ├─ start-client.bat
│  └─ DEPLOY_CLIENT.txt
├─ server-deploy.zip
└─ client-deploy.zip
```

## Hosting Model

SPARK AI is prepared for separate hosting:
- backend on a Node-capable host
- frontend on static hosting

Backend deployment summary:
1. Upload `production-ready/server-deploy.zip`.
2. Create `.env` from `.env.example`.
3. Set `SERVE_CLIENT=false`.
4. Set `CORS_ORIGIN` to your frontend URL.
5. Run `npm install` and `npm start`.

Frontend deployment summary:
1. Upload `production-ready/client-deploy.zip`.
2. Set `VITE_API_BASE_URL` to the backend URL.
3. Configure SPA fallback to `/index.html`.

Full instructions are in [docs/HOSTING_DEPLOYMENT.md](./docs/HOSTING_DEPLOYMENT.md).

## Environment Templates

Server settings live in:
- `.env.example`

Client settings live in:
- `.env.client.example`

The deployment build automatically syncs these templates and appends any env keys referenced by the source code.

## Useful Commands

```bash
npm run dev:server
npm run dev:client
npm run build:server
npm run build:client
npm run build:production
```

## Notes

- `production-ready/`, `dist/`, logs, backups, and other local build outputs are not tracked in git.
- Online sales and e-commerce deployment flows are not part of the SPARK AI hosting workflow.
