# TC Efficiency Measurement Dashboard

A full-stack enterprise analytics platform for the Technology Center (TC) Efficiency Measurement program. It ingests Excel-based plan data, stores it in PostgreSQL, and surfaces interactive KPI dashboards, trend charts, and data viewers — with role-based access, audit logging, and PWA support.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Prerequisites](#2-prerequisites)
3. [Environment Configuration](#3-environment-configuration)
4. [Local Development Setup](#4-local-development-setup)
5. [Database Setup](#5-database-setup)
6. [Docker Deployment](#6-docker-deployment)
7. [Non-Docker Deployment (IIS)](#7-non-docker-deployment-iis)
8. [Production Deployment Checklist](#8-production-deployment-checklist)
9. [Monitoring and Logging](#9-monitoring-and-logging)
10. [Backup and Recovery](#10-backup-and-recovery)
11. [Troubleshooting Guide](#11-troubleshooting-guide)
12. [Useful Commands Reference](#12-useful-commands-reference)
13. [Versioning and Release Process](#13-versioning-and-release-process)

---

## 1. Project Overview

### Description

The TC Efficiency Measurement Dashboard provides Technology Center management with a single source of truth for program efficiency metrics. Users upload the 14-column Excel plan file to populate the database; the dashboard then renders KPI cards, department breakdowns, trend charts, and detailed data tables — all filterable by Calendar Year or Financial Year.

### Features

- **Excel Upload & Validation** — 14-column plan data format with exact column matching, fuzzy fallback, and detailed error reporting
- **Two Dashboards** — "Classic" dashboard (legacy multi-sheet Excel) and "Plan" dashboard (14-column format)
- **8 Rich KPI Cards** — Total Programs, Departments, Est. Hours, Actual Hours, Effort Variance, Avg Productivity Index, Effort Saved (Hrs), Cost Saved (€) — each with interactive hover/click tooltips showing program and department breakdowns
- **Charts** — Department bar chart, quarterly trend chart, top-10 programs chart (Recharts + ECharts)
- **Data Viewer** — Sortable, filterable, exportable table (Material React Table) with CSV/PDF/Excel export
- **Manual Entry** — Form-based record creation for ad-hoc data
- **User Management** — Admin/Manager/Viewer roles with JWT-based authentication
- **Audit Log** — Full action audit trail per user
- **Structured Upload Error Reporting** — Separate Excel validation errors from database errors, 9-step upload summary table
- **PWA** — Installable, offline-capable (Service Worker via Vite PWA plugin)
- **Dark Mode** — System-aware, toggleable

### Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite 5, TailwindCSS 3, React Query v5, Zustand, React Router v6 |
| **UI Components** | Material React Table v2, MUI v5, Recharts v2, ECharts 5, Lucide React |
| **Backend** | Node.js 20, Express 4, Winston (logging), Multer, node-cron |
| **Database** | PostgreSQL 16 |
| **Auth** | JWT (jsonwebtoken), bcryptjs |
| **Excel Parsing** | xlsx (SheetJS) |
| **PDF Export** | pdfkit, jspdf |
| **Testing** | Vitest (frontend), Jest 29 (backend) |
| **Containerisation** | Docker, Docker Compose, Nginx (frontend serving) |

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Browser / PWA                                          │
│  React 18  ·  React Query  ·  Zustand  ·  TailwindCSS  │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/REST  (port 5173 dev / 80 prod)
┌────────────────────▼────────────────────────────────────┐
│  Nginx (Docker)  or  Vite dev-proxy  or  IIS            │
│  /api/* → backend:5000                                  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│  Express API  (port 5000)                               │
│  Routes: /api/*  ·  /api/plan/*  ·  /api/docs (Swagger) │
│  Multer (file uploads)  ·  Helmet / CORS / Rate-limit   │
│  Winston logs  ·  node-cron (weekly report, cleanup)    │
└────────────────────┬────────────────────────────────────┘
                     │ pg (pool)
┌────────────────────▼────────────────────────────────────┐
│  PostgreSQL 16                                          │
│  DB: tc_efficiency_db                                   │
│  Tables: users, roles, programs, plan_programs,         │
│          uploaded_files, plan_uploaded_files, …         │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Prerequisites

Install and verify each dependency before proceeding.

### Required

| Software | Minimum Version | Download |
|---|---|---|
| Node.js | **20 LTS** | https://nodejs.org |
| npm | **10+** (bundled with Node 20) | — |
| PostgreSQL | **16** | https://www.postgresql.org/download |
| Git | any | https://git-scm.com |

### Required for Docker deployment only

| Software | Version | Download |
|---|---|---|
| Docker Engine | 24+ | https://docs.docker.com/get-docker |
| Docker Compose | v2 (CLI plugin) | bundled with Docker Desktop |

### Required for IIS deployment only

| Software | Version | Notes |
|---|---|---|
| Windows Server / Windows 10+ | — | IIS is a Windows feature |
| IIS | 10 | Enable via Windows Features |
| IISNode | 0.2.26+ | https://github.com/tjanczuk/iisnode |
| URL Rewrite Module | 2.1 | From IIS Downloads |
| Node.js | 20 LTS | Must be installed on the IIS server |

### Verification commands

```bash
node --version      # v20.x.x
npm --version       # 10.x.x
psql --version      # psql (PostgreSQL) 16.x
docker --version    # Docker version 24.x.x
docker compose version  # Docker Compose version v2.x.x
```

---

## 3. Environment Configuration

### Backend — `backend/.env`

Create `backend/.env` by copying the template below. Never commit this file.

```env
# ── Server ────────────────────────────────────────────────
NODE_ENV=development
PORT=5000

# ── Database ──────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tc_efficiency_db
DB_USER=postgres
DB_PASSWORD=postgres123

# ── Auth ──────────────────────────────────────────────────
# IMPORTANT: Change JWT_SECRET to a long random string in production
JWT_SECRET=tc-efficiency-super-secret-jwt-key-2026-change-in-prod
JWT_EXPIRES_IN=24h

# ── CORS ──────────────────────────────────────────────────
FRONTEND_URL=http://localhost:5173

# ── Uploads ───────────────────────────────────────────────
UPLOAD_DIR=./uploads

# ── Logging ───────────────────────────────────────────────
LOG_DIR=./logs
LOG_LEVEL=info
```

#### Production differences

| Variable | Development | Production |
|---|---|---|
| `NODE_ENV` | `development` | `production` |
| `JWT_SECRET` | any string | 64+ character random secret |
| `FRONTEND_URL` | `http://localhost:5173` | `https://your-domain.com` |
| `LOG_LEVEL` | `debug` or `info` | `warn` |
| `DB_PASSWORD` | simple dev password | strong password from secrets manager |

Generate a production JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Frontend — `frontend/.env`

The frontend uses Vite's `.env` system. For development the Vite dev-server proxy (`/api` → `localhost:5000`) is configured in `vite.config.js`, so no `.env` file is required locally.

For a production build that talks to a non-default backend URL, create `frontend/.env.production`:

```env
VITE_API_BASE_URL=https://api.your-domain.com
```

If you use this variable, update `frontend/src/services/api.js` to read:
```js
baseURL: import.meta.env.VITE_API_BASE_URL || '/api'
```

---

## 4. Local Development Setup

### Quick start (Windows — recommended)

The project ships with `start.bat` which installs dependencies, creates the database, runs migrations, seeds data, and launches both servers:

```bat
start.bat
```

Servers open in separate console windows. Press any key in the original window to dismiss the pause. To stop:

```bat
stop.bat
```

---

### Manual setup (all platforms)

#### 4.1 Backend

```bash
# 1. Enter the backend directory
cd backend

# 2. Install dependencies
npm install

# 3. Create .env (copy the template from Section 3)
cp .env.example .env        # Linux/macOS
copy .env.example .env      # Windows

# 4. Edit .env with your database credentials

# 5. Run migrations (creates all tables)
npm run migrate

# 6. Seed initial data (default users + sample records)
node src/seeds/seed.js

# 7. Start the development server (auto-restarts on changes)
npm run dev
```

The API is available at:
- `http://localhost:5000/api/health`
- `http://localhost:5000/api/docs` (Swagger UI)

#### 4.2 Frontend

In a separate terminal:

```bash
# 1. Enter the frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Start the Vite development server
npm run dev
```

The app is available at `http://localhost:5173`.

The Vite dev server proxies all `/api/*` requests to `http://localhost:5000`, so both servers can run concurrently without CORS issues.

#### Default login credentials

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin@123456` |
| Manager | `manager` | `Manager@123` |
| Viewer | `viewer` | `Viewer@123` |

> **Change all default passwords before any deployment.**

---

## 5. Database Setup

### 5.1 Installation

**Windows** — Download the PostgreSQL 16 installer from https://www.postgresql.org/download/windows/ and run it. Accept defaults; set the superuser password when prompted.

**Ubuntu/Debian**:
```bash
sudo apt update
sudo apt install -y postgresql-16 postgresql-client-16
sudo systemctl enable --now postgresql
```

**macOS** (Homebrew):
```bash
brew install postgresql@16
brew services start postgresql@16
```

### 5.2 Database creation

```bash
# Connect as the postgres superuser
psql -U postgres -h localhost

# Create the database
CREATE DATABASE tc_efficiency_db;

# Verify
\l tc_efficiency_db

# Exit
\q
```

Or non-interactively:

```bash
psql -U postgres -h localhost -c "CREATE DATABASE tc_efficiency_db;"
```

### 5.3 Running migrations

Migrations are SQL files in `backend/src/migrations/`. The migration runner applies them in order:

| File | Purpose |
|---|---|
| `001_initial.sql` | Core tables: `roles`, `users`, `upload_years`, `uploaded_files`, `programs`, `sync_queue` |
| `002_plan_module.sql` | Plan module tables: `plan_upload_years`, `plan_uploaded_files`, `plan_programs` |

```bash
cd backend
npm run migrate
```

Expected output:
```
Running migrations...
  Running: 001_initial.sql
  Done: 001_initial.sql
  Running: 002_plan_module.sql
  Done: 002_plan_module.sql
All migrations completed successfully.
```

### 5.4 Seed data

The seed script inserts default roles, three demo users, and sample program records from the reference Excel file:

```bash
cd backend
node src/seeds/seed.js
```

### 5.5 Verification

```bash
psql -U postgres -d tc_efficiency_db -c "\dt"
```

Expected tables: `roles`, `users`, `upload_years`, `uploaded_files`, `programs`, `plan_upload_years`, `plan_uploaded_files`, `plan_programs`, `sync_queue`.

### 5.6 Rollback

Migrations use `CREATE TABLE IF NOT EXISTS`, so re-running is safe. To fully reset:

```bash
psql -U postgres -h localhost -c "DROP DATABASE tc_efficiency_db;"
psql -U postgres -h localhost -c "CREATE DATABASE tc_efficiency_db;"
cd backend && npm run migrate
```

> This destroys all data. In production, take a backup first (see Section 10).

---

## 6. Docker Deployment

### 6.1 Prerequisites

- Docker Desktop (Windows/macOS) or Docker Engine + Docker Compose v2 (Linux)
- Ports `5000`, `5173`, and `5432` free on the host

### 6.2 Build and run

From the project root (where `docker-compose.yml` lives):

```bash
# Build all images and start all containers in the background
docker compose up --build -d
```

First startup takes 2–4 minutes while images download and build. Subsequent starts are faster.

### 6.3 Database initialisation (first run only)

The containers start but the database is empty. Run migrations and seed data inside the backend container:

```bash
# Run migrations
docker compose exec backend node src/migrations/migrate.js

# Seed initial data
docker compose exec backend node src/seeds/seed.js
```

### 6.4 Verify everything is running

```bash
docker compose ps
```

| Container | Status | Port |
|---|---|---|
| `tc_postgres` | `Up (healthy)` | 5432 |
| `tc_backend` | `Up` | 5000 |
| `tc_frontend` | `Up` | 5173→80 |

Access:
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000/api/health
- Swagger Docs: http://localhost:5000/api/docs

### 6.5 Common Docker operations

```bash
# View logs for a specific service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres

# Stop all containers (data preserved)
docker compose down

# Stop and remove volumes (DESTROYS database data)
docker compose down -v

# Restart a single service
docker compose restart backend

# Rebuild a single service after code changes
docker compose up --build -d backend

# Execute a command inside a container
docker compose exec backend npm run migrate
docker compose exec postgres psql -U postgres -d tc_efficiency_db
```

### 6.6 Docker Compose service descriptions

```yaml
services:
  postgres:     # PostgreSQL 16 Alpine — persists data in named volume tc_postgres_data
  backend:      # Node.js 20 Alpine — Express API, depends on postgres health check
  frontend:     # Nginx Alpine — serves Vite production build, proxies /api to backend
```

**Port mappings**

| Service | Container port | Host port |
|---|---|---|
| postgres | 5432 | 5432 |
| backend | 5000 | 5000 |
| frontend | 80 | 5173 |

**Volume mappings**

| Volume | Purpose |
|---|---|
| `tc_postgres_data` | Named volume — PostgreSQL data directory |
| `./backend/uploads:/app/uploads` | Bind mount — persists uploaded Excel files |
| `./backend/logs:/app/logs` | Bind mount — persists Winston log files on host |

### 6.7 Customising Docker environment

Edit the `environment:` block in `docker-compose.yml` for the `backend` service to change any of the variables listed in Section 3. For production, use Docker secrets or an `.env` file at the compose level:

```bash
# docker-compose.yml can read from a .env file at the same level
# Create .env next to docker-compose.yml:
DB_PASSWORD=strong-prod-password
JWT_SECRET=64-char-random-secret
```

Then reference them in `docker-compose.yml`:
```yaml
DB_PASSWORD: ${DB_PASSWORD}
JWT_SECRET: ${JWT_SECRET}
```

---

## 7. Non-Docker Deployment (IIS)

This section covers deploying the backend (Node.js via IISNode) and frontend (static files) to Windows IIS.

### 7.1 IIS installation

Open PowerShell as Administrator:

```powershell
# Enable IIS and required features
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole, `
  IIS-WebServer, IIS-CommonHttpFeatures, IIS-StaticContent, `
  IIS-DefaultDocument, IIS-HttpErrors, IIS-ApplicationDevelopment, `
  IIS-ASPNET45, IIS-NetFxExtensibility45, IIS-ISAPIExtensions, `
  IIS-ISAPIFilter, IIS-HttpCompressionStatic, IIS-ManagementConsole
```

Then install additional modules:

1. **URL Rewrite Module** — Download from https://www.iis.net/downloads/microsoft/url-rewrite and install
2. **IISNode** — Download from https://github.com/tjanczuk/iisnode/releases and install

Verify IISNode installation:

```powershell
Test-Path "C:\Program Files\iisnode\iisnode.dll"   # Should return True
```

### 7.2 Backend deployment (IISNode)

#### Step 1 — Prepare the deployment folder

```powershell
# Create deployment directory
New-Item -ItemType Directory -Force "C:\inetpub\wwwroot\tc-api"

# Copy backend files (exclude dev-only items)
$src = "D:\2026\May\TC_Efficiency_Measurement_Dashboard\backend"
$dst = "C:\inetpub\wwwroot\tc-api"

Copy-Item "$src\src" "$dst\src" -Recurse -Force
Copy-Item "$src\package.json" "$dst\package.json"
Copy-Item "$src\package-lock.json" "$dst\package-lock.json"

# Install production dependencies only
Set-Location $dst
npm ci --only=production

# Create required directories
New-Item -ItemType Directory -Force "$dst\uploads"
New-Item -ItemType Directory -Force "$dst\logs"
```

#### Step 2 — Create `.env` for production

Create `C:\inetpub\wwwroot\tc-api\.env`:

```env
NODE_ENV=production
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tc_efficiency_db
DB_USER=postgres
DB_PASSWORD=<your-production-password>
JWT_SECRET=<64-char-random-secret>
JWT_EXPIRES_IN=24h
FRONTEND_URL=https://your-domain.com
UPLOAD_DIR=C:\inetpub\wwwroot\tc-api\uploads
LOG_DIR=C:\inetpub\wwwroot\tc-api\logs
LOG_LEVEL=warn
```

#### Step 3 — Create `web.config` for IISNode

Create `C:\inetpub\wwwroot\tc-api\web.config`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <handlers>
      <add name="iisnode" path="src/server.js" verb="*" modules="iisnode" />
    </handlers>
    <rewrite>
      <rules>
        <rule name="NodeInspector" patternSyntax="ECMAScript" stopProcessing="true">
          <match url="^src/server.js\/debug[\/]?" />
        </rule>
        <rule name="StaticContent">
          <action type="Rewrite" url="public{REQUEST_URI}" />
        </rule>
        <rule name="DynamicContent">
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
          </conditions>
          <action type="Rewrite" url="src/server.js" />
        </rule>
      </rules>
    </rewrite>
    <iisnode
      nodeProcessCommandLine="node"
      watchedFiles="web.config;*.js"
      loggingEnabled="true"
      logDirectory="logs"
      debuggingEnabled="false"
    />
    <security>
      <requestFiltering>
        <requestLimits maxAllowedContentLength="52428800" />
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
```

#### Step 4 — Create Application Pool and Website

Open **IIS Manager** (or use PowerShell):

```powershell
Import-Module WebAdministration

# Create Application Pool (No Managed Code — Node.js is not .NET)
New-WebAppPool -Name "TCApiPool"
Set-ItemProperty "IIS:\AppPools\TCApiPool" -Name "managedRuntimeVersion" -Value ""
Set-ItemProperty "IIS:\AppPools\TCApiPool" -Name "processModel.identityType" -Value "ApplicationPoolIdentity"
Set-ItemProperty "IIS:\AppPools\TCApiPool" -Name "startMode" -Value "AlwaysRunning"

# Create the IIS website (adjust port as needed — use 5000 or 80 with path prefix)
New-Website -Name "TCApi" `
            -Port 5000 `
            -PhysicalPath "C:\inetpub\wwwroot\tc-api" `
            -ApplicationPool "TCApiPool"

# Grant the AppPool identity write access to uploads and logs
$appPoolUser = "IIS AppPool\TCApiPool"
$paths = @("C:\inetpub\wwwroot\tc-api\uploads", "C:\inetpub\wwwroot\tc-api\logs")
foreach ($path in $paths) {
    $acl = Get-Acl $path
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($appPoolUser, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.SetAccessRule($rule)
    Set-Acl $path $acl
}
```

#### Step 5 — Run migrations on the server

```powershell
Set-Location "C:\inetpub\wwwroot\tc-api"
node src/migrations/migrate.js
```

#### Step 6 — Verify the backend

```powershell
Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing
```

Expected: `{"status":"ok","timestamp":"...","uptime":...}`

---

### 7.3 Frontend deployment (IIS static site)

#### Step 1 — Build the production assets

On the build machine (or CI server):

```bash
cd frontend

# Install dependencies
npm ci

# Create production .env if backend is not on the same origin
# echo VITE_API_BASE_URL=https://api.your-domain.com > .env.production

# Build
npm run build
```

Output is in `frontend/dist/`.

#### Step 2 — Copy to IIS

```powershell
$dst = "C:\inetpub\wwwroot\tc-dashboard"
New-Item -ItemType Directory -Force $dst

Copy-Item "D:\2026\May\TC_Efficiency_Measurement_Dashboard\frontend\dist\*" $dst -Recurse -Force
```

#### Step 3 — Create `web.config` for SPA routing

React Router uses client-side routing. Without this config, any deep link (e.g. `/plan/dashboard`) returns 404 from IIS.

Create `C:\inetpub\wwwroot\tc-dashboard\web.config`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>

    <!-- SPA fallback: serve index.html for all non-file requests -->
    <rewrite>
      <rules>
        <rule name="SPA Fallback" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
            <add input="{REQUEST_URI}" pattern="^/(api)" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>

    <!-- Static file caching -->
    <staticContent>
      <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="365.00:00:00" />
      <!-- Cache-bust JS/CSS assets (they have content hashes in filenames) -->
    </staticContent>

    <!-- HTTP Compression -->
    <urlCompression doStaticCompression="true" doDynamicCompression="true" />

    <!-- Security headers -->
    <httpProtocol>
      <customHeaders>
        <add name="X-Frame-Options" value="SAMEORIGIN" />
        <add name="X-Content-Type-Options" value="nosniff" />
        <add name="X-XSS-Protection" value="1; mode=block" />
        <add name="Referrer-Policy" value="strict-origin-when-cross-origin" />
      </customHeaders>
    </httpProtocol>

    <!-- Ensure correct MIME type for ES modules -->
    <staticContent>
      <mimeMap fileExtension=".mjs" mimeType="application/javascript" />
      <mimeMap fileExtension=".webmanifest" mimeType="application/manifest+json" />
    </staticContent>

  </system.webServer>
</configuration>
```

#### Step 4 — Create IIS Website for the frontend

```powershell
Import-Module WebAdministration

New-WebAppPool -Name "TCDashboardPool"
Set-ItemProperty "IIS:\AppPools\TCDashboardPool" -Name "managedRuntimeVersion" -Value ""

New-Website -Name "TCDashboard" `
            -Port 80 `
            -PhysicalPath "C:\inetpub\wwwroot\tc-dashboard" `
            -ApplicationPool "TCDashboardPool"
```

#### Step 5 — API reverse proxy (optional)

If the frontend and backend run on the same server, use the **Application Request Routing (ARR)** IIS module to proxy `/api/*` from port 80 to the backend on port 5000. Install ARR from https://www.iis.net/downloads/microsoft/application-request-routing, then add to `web.config`:

```xml
<rule name="API Proxy" stopProcessing="true">
  <match url="^api/(.*)" />
  <action type="Rewrite" url="http://localhost:5000/api/{R:1}" />
</rule>
```

#### Step 6 — SSL (recommended for production)

1. Obtain a certificate (Let's Encrypt, internal CA, or commercial)
2. In IIS Manager → Site Bindings → Add HTTPS binding → select certificate
3. Add HTTP → HTTPS redirect rule in `web.config`:

```xml
<rule name="HTTPS Redirect" stopProcessing="true">
  <match url="(.*)" />
  <conditions>
    <add input="{HTTPS}" pattern="^OFF$" />
  </conditions>
  <action type="Redirect" url="https://{HTTP_HOST}/{R:0}" redirectType="Permanent" />
</rule>
```

---

## 8. Production Deployment Checklist

Run through this list before going live.

### Database

- [ ] PostgreSQL is running and accessible from the backend server
- [ ] `tc_efficiency_db` database created
- [ ] All migrations executed (`npm run migrate` exits cleanly)
- [ ] Seed data loaded (default admin user exists)
- [ ] `DB_PASSWORD` set to a strong password (not `postgres123`)
- [ ] Database is not directly exposed to the internet (firewall rule)
- [ ] Automated backups configured (see Section 10)

### Backend API

- [ ] `NODE_ENV=production` in `.env`
- [ ] `JWT_SECRET` is a 64-character random string (not the default)
- [ ] `FRONTEND_URL` matches the production frontend domain (CORS)
- [ ] `npm run migrate` completes without errors
- [ ] `GET /api/health` returns `200 OK`
- [ ] `POST /api/auth/login` works with the admin credentials
- [ ] File uploads directory (`uploads/`) has write permission
- [ ] Log directory (`logs/`) has write permission
- [ ] Rate limiting is active (verify with repeated rapid requests)

### Frontend

- [ ] Production build (`npm run build`) completes without errors
- [ ] `VITE_API_BASE_URL` points to the correct backend URL (if not same-origin)
- [ ] SPA routing works (navigate to `/plan/dashboard`, refresh — no 404)
- [ ] API calls succeed (network tab shows 2xx responses)
- [ ] Excel file upload end-to-end works
- [ ] PWA manifest loads (DevTools → Application → Manifest)

### Security

- [ ] HTTPS enabled and HTTP redirects to HTTPS
- [ ] Security headers present (`X-Frame-Options`, `X-Content-Type-Options`, etc.)
- [ ] Default passwords changed for all three demo users
- [ ] Swagger UI disabled or access-restricted in production
- [ ] No `.env` files committed to version control

### Operational

- [ ] Log rotation configured (Winston maxFiles / OS-level logrotate)
- [ ] Monitoring/alerting set up (see Section 9)
- [ ] Backup tested end-to-end (backup → restore → verify)
- [ ] Rollback procedure documented and tested

---

## 9. Monitoring and Logging

### Log file locations

| Log | Path | Contents |
|---|---|---|
| API errors | `backend/logs/error.log` | `error` level only |
| API combined | `backend/logs/combined.log` | All levels |
| Audit trail | `backend/logs/audit.log` | User actions |
| IIS access | `%SystemDrive%\inetpub\logs\LogFiles\` | HTTP request log |
| IIS IISNode | `backend/logs/*.txt` (from `web.config` logDirectory) | stdout/stderr |
| Docker backend | `docker compose logs backend` | Live container output |

### Log format

Winston writes JSON lines to file and colorised text to the console:

```json
{"level":"info","message":"POST /plan/uploads","timestamp":"2026-06-24 09:15:32","ip":"::1"}
{"level":"error","message":"Database error","timestamp":"2026-06-24 09:16:01","error":"relation \"plan_upload_years\" does not exist"}
```

### Tailing logs

**Development:**
```bash
# Backend (live)
cd backend && npm run dev    # nodemon output in terminal

# Winston combined log
Get-Content backend\logs\combined.log -Wait -Tail 50     # PowerShell
tail -f backend/logs/combined.log                        # Bash
```

**Docker:**
```bash
docker compose logs -f backend --tail 100
docker compose logs -f postgres --tail 50
```

**IIS (IISNode):**
```powershell
# IISNode creates per-process log files
Get-ChildItem "C:\inetpub\wwwroot\tc-api\logs" | Sort LastWriteTime -Desc | Select -First 3
Get-Content "C:\inetpub\wwwroot\tc-api\logs\<latest-file>.txt" -Tail 50 -Wait
```

### Health endpoint

The backend exposes a health check at `GET /api/health`. Poll this from your monitoring tool (Uptime Robot, Prometheus blackbox exporter, etc.):

```bash
curl http://localhost:5000/api/health
# {"status":"ok","timestamp":"2026-06-24T09:00:00.000Z","uptime":3600,"database":"connected"}
```

### Log rotation

Winston rotates automatically: `maxsize: 10–20 MB`, `maxFiles: 5–30`. For additional OS-level rotation on Linux:

```bash
# /etc/logrotate.d/tc-efficiency
/opt/tc-efficiency/backend/logs/*.log {
    daily
    rotate 30
    compress
    missingok
    notifempty
    sharedscripts
    postrotate
        kill -USR1 $(cat /opt/tc-efficiency/backend/tc-backend.pid 2>/dev/null) 2>/dev/null || true
    endscript
}
```

---

## 10. Backup and Recovery

### Database backup

**Manual backup:**

```bash
# Full database dump (custom format — recommended)
pg_dump -U postgres -h localhost -Fc tc_efficiency_db -f "tc_efficiency_db_$(date +%Y%m%d_%H%M%S).dump"

# Plain SQL dump
pg_dump -U postgres -h localhost tc_efficiency_db > "tc_efficiency_db_$(date +%Y%m%d_%H%M%S).sql"
```

**Windows (PowerShell):**

```powershell
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "C:\Backups\tc_efficiency_db_$timestamp.dump"
& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -U postgres -h localhost -Fc tc_efficiency_db -f $backupFile
Write-Host "Backup saved to: $backupFile"
```

**Docker:**

```bash
docker compose exec postgres pg_dump -U postgres -Fc tc_efficiency_db > "backup_$(date +%Y%m%d).dump"
```

### Automated backup (Windows Task Scheduler)

Create `C:\Scripts\backup-tc.ps1`:

```powershell
$backupDir = "C:\Backups\tc-efficiency"
New-Item -ItemType Directory -Force $backupDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$file = "$backupDir\tc_efficiency_db_$timestamp.dump"
& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -U postgres -Fc tc_efficiency_db -f $file
# Keep last 30 backups
Get-ChildItem $backupDir -Filter "*.dump" | Sort CreationTime -Desc | Select -Skip 30 | Remove-Item -Force
```

Schedule it:

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NonInteractive -File C:\Scripts\backup-tc.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00AM"
Register-ScheduledTask -TaskName "TC Efficiency DB Backup" -Action $action -Trigger $trigger -RunLevel Highest
```

### Restore

```bash
# Drop and recreate (DESTRUCTIVE — confirm before running)
psql -U postgres -h localhost -c "DROP DATABASE IF EXISTS tc_efficiency_db;"
psql -U postgres -h localhost -c "CREATE DATABASE tc_efficiency_db;"

# Restore from custom format dump
pg_restore -U postgres -h localhost -d tc_efficiency_db "backup_20260624.dump"

# Restore from SQL dump
psql -U postgres -h localhost -d tc_efficiency_db < "backup_20260624.sql"
```

### Uploads backup

Excel uploads are stored in `backend/uploads/`. Back them up alongside the database:

```powershell
$timestamp = Get-Date -Format "yyyyMMdd"
Compress-Archive -Path "C:\inetpub\wwwroot\tc-api\uploads\*" -DestinationPath "C:\Backups\tc-uploads-$timestamp.zip" -Force
```

### Configuration backup

Back up `.env` and `web.config` files separately (exclude from git if they contain secrets):

```powershell
Copy-Item "C:\inetpub\wwwroot\tc-api\.env" "C:\Backups\config\backend.env.$timestamp"
Copy-Item "C:\inetpub\wwwroot\tc-api\web.config" "C:\Backups\config\backend-web.config.$timestamp"
```

### Disaster recovery

1. Provision a new server with Node.js 20 and PostgreSQL 16
2. Deploy application files (Section 7)
3. Create `.env` from backup
4. Create database: `psql -U postgres -c "CREATE DATABASE tc_efficiency_db;"`
5. Restore dump: `pg_restore -U postgres -d tc_efficiency_db latest.dump`
6. Restore uploads folder from backup
7. Verify health endpoint responds

---

## 11. Troubleshooting Guide

### Common issues

| Issue | Cause | Resolution |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL not running | Start PostgreSQL service: `net start postgresql-x64-16` (Windows) or `sudo systemctl start postgresql` |
| `relation "plan_upload_years" does not exist` | Migration 002 not run | `cd backend && npm run migrate` |
| `relation "plan_programs" does not exist` | Migration 002 not run | Same as above |
| `Excel validation failed` with column mismatch | Wrong column names in upload file | Ensure the file matches the 14-column format; column names are case-sensitive with exact spacing |
| `JWT malformed` or `invalid signature` | `JWT_SECRET` changed after tokens issued | Clear browser localStorage and log in again |
| `CORS error` in browser | `FRONTEND_URL` mismatch in backend `.env` | Set `FRONTEND_URL` to the exact origin of the frontend (e.g. `http://localhost:5173`) |
| Docker container not starting — port conflict | Port already in use | `netstat -ano \| findstr :5000` then stop the conflicting process, or change the host port in `docker-compose.yml` |
| `npm install` fails with peer dependency errors | Version conflicts | Use `npm install --legacy-peer-deps` |
| IIS returns 500.19 | Invalid `web.config` syntax | Validate XML; check IIS Event Log for details |
| IIS returns 500.1001 | IISNode cannot find `node.exe` | Ensure Node.js is installed and `node` is in the system PATH for the IIS Application Pool user |
| File upload silently fails | `uploads/` directory missing or no write permission | Create the directory and grant `IIS AppPool\<pool-name>` FullControl |
| `Too many requests` 429 error | Rate limit hit (300 req/min per IP) | Reduce request frequency or adjust limits in `backend/src/app.js` |
| Frontend shows blank page after deployment | SPA routing not configured | Ensure `web.config` URL Rewrite rule for SPA fallback is in place (Section 7.3) |
| Dark mode flicker on page load | Tailwind dark class not applied fast enough | Add `class="dark"` to `<html>` from a blocking inline script if needed |
| Database migration fails mid-way | SQL error in migration file | Check `psql` output; fix the SQL; drop affected tables manually then re-run |

### Diagnostic commands

```bash
# Check backend is reachable
curl http://localhost:5000/api/health

# Check database tables exist
psql -U postgres -d tc_efficiency_db -c "\dt"

# Check which process is using port 5000
netstat -ano | findstr :5000        # Windows
lsof -i :5000                       # Linux/macOS

# Test database connection from backend directory
node -e "require('dotenv').config(); const { checkConnection } = require('./src/config/database'); checkConnection().then(() => { console.log('DB OK'); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); })"

# Docker — inspect a container's environment
docker compose exec backend env | grep DB

# Validate .env is being read
node -e "require('dotenv').config(); console.log('DB_HOST:', process.env.DB_HOST)"
```

---

## 12. Useful Commands Reference

### Development

```bash
# Start everything (Windows quick start)
start.bat

# Backend dev server (auto-reload)
cd backend && npm run dev

# Frontend dev server
cd frontend && npm run dev

# Run all backend tests
cd backend && npm test

# Run all frontend tests
cd frontend && npm test

# Run a specific backend test file
cd backend && ./node_modules/.bin/jest tests/planAnalyticsController.test.js --forceExit

# Watch frontend tests
cd frontend && npm run test:watch
```

### Build

```bash
# Build frontend for production
cd frontend && npm run build

# Preview the production build locally
cd frontend && npm run preview

# Install backend production deps only
cd backend && npm ci --only=production
```

### Database

```bash
# Run all migrations
cd backend && npm run migrate

# Seed data
cd backend && node src/seeds/seed.js

# Connect to database interactively
psql -U postgres -d tc_efficiency_db

# Full database backup
pg_dump -U postgres -Fc tc_efficiency_db -f backup.dump

# Restore from backup
pg_restore -U postgres -d tc_efficiency_db backup.dump

# Check table row counts
psql -U postgres -d tc_efficiency_db -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"
```

### Docker

```bash
# Build and start all containers
docker compose up --build -d

# View running containers
docker compose ps

# View live logs
docker compose logs -f
docker compose logs -f backend
docker compose logs -f postgres

# Stop containers
docker compose down

# Stop and destroy all data
docker compose down -v

# Restart single service
docker compose restart backend

# Execute command in container
docker compose exec backend node src/migrations/migrate.js
docker compose exec backend node src/seeds/seed.js
docker compose exec postgres psql -U postgres -d tc_efficiency_db

# Rebuild single container after code change
docker compose up --build -d backend

# Check resource usage
docker stats
```

### IIS deployment

```powershell
# Restart IIS
iisreset

# Restart specific Application Pool
Restart-WebAppPool "TCApiPool"
Restart-WebAppPool "TCDashboardPool"

# Check site status
Get-Website "TCApi"
Get-Website "TCDashboard"

# Start/stop a site
Start-Website "TCApi"
Stop-Website "TCApi"

# Check IISNode logs
Get-ChildItem "C:\inetpub\wwwroot\tc-api\logs" | Sort LastWriteTime -Desc | Select -First 5

# Test backend after deploy
Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing
```

### Log monitoring

```bash
# Tail all Winston logs (Bash)
tail -f backend/logs/combined.log
tail -f backend/logs/error.log

# Last 100 error log lines (PowerShell)
Get-Content backend\logs\error.log -Tail 100

# Search logs for a specific request or error
grep "plan_upload_years" backend/logs/error.log
Select-String "plan_upload_years" backend\logs\error.log     # PowerShell
```

### Backup and restore

```bash
# Backup
pg_dump -U postgres -Fc tc_efficiency_db -f "backup_$(date +%Y%m%d).dump"

# Restore
pg_restore -U postgres -d tc_efficiency_db backup_20260624.dump

# Backup uploads folder (PowerShell)
Compress-Archive backend\uploads\* backups\uploads-$(Get-Date -f yyyyMMdd).zip
```

---

## 13. Versioning and Release Process

### Version scheme

The project follows **Semantic Versioning** (`MAJOR.MINOR.PATCH`):

- `PATCH` — bug fixes, hotfixes, column name corrections
- `MINOR` — new features (e.g. new KPI cards, new chart type), non-breaking API additions
- `MAJOR` — breaking changes to the database schema, API contract, or Excel format

Current version: `1.0.0` (see `backend/package.json` and `frontend/package.json`).

### Build process

```bash
# 1. Run tests (must all pass)
cd backend && npm test
cd frontend && npm test

# 2. Build frontend
cd frontend && npm run build

# 3. Tag the release
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

### Deployment process

**Docker:**

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker compose up --build -d

# Run any new migrations
docker compose exec backend node src/migrations/migrate.js

# Verify health
curl http://localhost:5000/api/health
```

**IIS:**

```powershell
# 1. Build on CI/build machine
cd frontend && npm ci && npm run build

# 2. Stop the IIS sites
Stop-Website "TCApi"
Stop-Website "TCDashboard"

# 3. Copy new backend files
Copy-Item .\backend\src "C:\inetpub\wwwroot\tc-api\src" -Recurse -Force

# 4. Copy new frontend build
Copy-Item .\frontend\dist\* "C:\inetpub\wwwroot\tc-dashboard" -Recurse -Force

# 5. Run new migrations
Set-Location "C:\inetpub\wwwroot\tc-api"
node src/migrations/migrate.js

# 6. Restart sites
Start-Website "TCApi"
Start-Website "TCDashboard"

# 7. Verify
Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing
Invoke-WebRequest -Uri "http://localhost:80" -UseBasicParsing
```

### Rollback strategy

**Database rollback** — migrations use `CREATE TABLE IF NOT EXISTS` and are additive. Structural rollback requires a restore from backup:

```bash
# Stop the backend
# Restore from the backup taken before the release
pg_restore -U postgres -d tc_efficiency_db backup_pre_release.dump
# Redeploy the previous backend version
```

**Application rollback** — keep the previous `dist/` folder and backend `src/` archived:

```powershell
# Swap in the previous deployment
Copy-Item "C:\Backups\releases\v0.9.0\dist\*" "C:\inetpub\wwwroot\tc-dashboard" -Force -Recurse
Copy-Item "C:\Backups\releases\v0.9.0\src" "C:\inetpub\wwwroot\tc-api\src" -Force -Recurse
iisreset
```

**Docker rollback** — use image tags:

```bash
# Build with explicit tag
docker compose build --build-arg VERSION=1.0.0
docker tag tc_backend:latest tc_backend:v1.0.0

# Roll back
docker tag tc_backend:v0.9.0 tc_backend:latest
docker compose up -d
```

---

*For issues and feature requests, contact the TC Efficiency Dashboard development team.*
