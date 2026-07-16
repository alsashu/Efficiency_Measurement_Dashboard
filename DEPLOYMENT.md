# TC Efficiency Measurement Dashboard — IIS Deployment Guide

> **Audience:** Deployment engineers and developers with no prior knowledge of this application.  
> **Platform:** Windows Server with IIS.  
> **Last updated:** 2026-06-25  

---

## Table of Contents

1. [Deployment Overview](#1-deployment-overview)
2. [Pre-Deployment Checklist](#2-pre-deployment-checklist)
3. [Backend Deployment (IIS + IISNode)](#3-backend-deployment-iis--iisnode)
4. [Frontend Deployment (IIS Static Site)](#4-frontend-deployment-iis-static-site)
5. [Code Changes Required Before Deployment](#5-code-changes-required-before-deployment)
6. [Database Deployment](#6-database-deployment)
7. [Post-Deployment Verification](#7-post-deployment-verification)
8. [Troubleshooting Guide](#8-troubleshooting-guide)
9. [Rollback Procedure](#9-rollback-procedure)
10. [Deployment Best Practices](#10-deployment-best-practices)

---

## 1. Deployment Overview

### Solution Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Windows Server                           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  IIS — Public Site (port 80 / 443)                      │   │
│  │  Host: tc-efficiency.company.com                        │   │
│  │                                                         │   │
│  │  ┌──────────────────┐   ┌─────────────────────────┐    │   │
│  │  │  React SPA       │   │  ARR Reverse Proxy       │    │   │
│  │  │  (static files)  │   │  /api/* → localhost:5000 │    │   │
│  │  │  dist/           │   │                         │    │   │
│  │  └──────────────────┘   └─────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                │                                │
│                                │ HTTP (internal only)           │
│                                ▼                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  IIS — Backend Site (port 5000, loopback only)          │   │
│  │  IISNode → Node.js 20 / Express 4                       │   │
│  │  Entry point: src/server.js                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                │                                │
│                                │                                │
│  ┌─────────────────────────────▼───────────────────────────┐   │
│  │  PostgreSQL 16                                          │   │
│  │  Database: tc_efficiency_db                             │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Summary

| Component | Technology | Deployment Method | Default Port |
|-----------|-----------|-------------------|--------------|
| Frontend | React 18 / Vite 5 / TailwindCSS 3 | IIS Static Site + URL Rewrite | 80 / 443 |
| Backend | Node.js 20 / Express 4 | IIS + IISNode | 5000 (internal) |
| Database | PostgreSQL 16 | Windows Service | 5432 |

### Key Architecture Decisions

- **ARR Reverse Proxy**: The frontend IIS site proxies all `/api/*` requests to the backend on `localhost:5000`. This means the React app's relative `baseURL: '/api'` works without any code changes in production.
- **IISNode**: The backend runs as a Node.js process managed by IIS via the IISNode module. IIS handles process management, logging, and restart-on-crash.
- **Loopback-only backend**: The backend IIS site binds to `127.0.0.1:5000` only — it is never directly accessible from the network. All external traffic goes through the frontend site and ARR proxy.

---

## 2. Pre-Deployment Checklist

### 2.1 Server Software Requirements

| Requirement | Minimum Version | Notes |
|-------------|----------------|-------|
| Windows Server | 2019 or 2022 | 2022 recommended |
| IIS | 10.0 | Included with Windows Server |
| Node.js | 20.x LTS | Install from nodejs.org |
| PostgreSQL | 16.x | Install from postgresql.org |
| IIS URL Rewrite Module | 2.1 | Download from IIS.net |
| IISNode | 0.2.26 or later | Download from github.com/azure/iisnode |
| Application Request Routing (ARR) | 3.0 | Download from IIS.net — enables reverse proxy |

### 2.2 Required Windows Features

Enable the following via **Server Manager → Add Roles and Features → Web Server (IIS)**:

```
Web Server (IIS)
  ├── Common HTTP Features
  │     ├── Default Document
  │     ├── Static Content
  │     └── HTTP Errors
  ├── Application Development
  │     ├── Application Initialization
  │     └── (IISNode adds its own handler)
  ├── Health and Diagnostics
  │     └── HTTP Logging
  ├── Performance
  │     └── Static Content Compression
  └── Security
        └── Request Filtering
```

Or via PowerShell (run as Administrator):

```powershell
Install-WindowsFeature -Name Web-Server, Web-Default-Doc, Web-Static-Content, `
  Web-Http-Errors, Web-App-Dev, Web-Http-Logging, Web-Stat-Compression, `
  Web-Filtering, Web-Mgmt-Console
```

### 2.3 Network Requirements

| Purpose | URL / Address | Port |
|---------|--------------|------|
| Frontend (HTTP) | `http://tc-efficiency.company.com` | 80 |
| Frontend (HTTPS) | `https://tc-efficiency.company.com` | 443 |
| Backend (internal only) | `http://127.0.0.1:5000` | 5000 |
| Database | `localhost` or DB server IP | 5432 |

**Firewall rules required:**

```
Inbound: TCP 80   (HTTP)   from Any
Inbound: TCP 443  (HTTPS)  from Any
Inbound: TCP 5432 (PostgreSQL) from Server Loopback ONLY
Block:   TCP 5000 from External (backend must not be directly reachable)
```

### 2.4 SSL Certificate

Obtain an SSL certificate for `tc-efficiency.company.com` from your PKI/CA and import it into the Windows Certificate Store (Local Machine → Personal) before configuring HTTPS bindings.

### 2.5 Local Development Pre-flight (Optional but Recommended)

Before deploying to IIS, verify the application runs correctly on the developer workstation using the provided `start.bat` script. This is **not used for IIS deployment** — it starts Vite's dev server, not a production build — but it is the fastest way to confirm database connectivity, migrations, and feature correctness before committing to a server rollout.

```bat
:: Run from the project root on a Windows developer machine
start.bat
```

`start.bat` performs the following pre-flight checks and steps:

| Check / Step | What it validates |
|--------------|-------------------|
| Node.js 20+ installed | Minimum runtime version — error if missing, warning if below 20 |
| `backend/.env` exists | Warns with required key list if missing; gives option to abort |
| `backend\templates\TC_Efficiency-Clean.xlsx` exists | Warns if the Plan template file is absent (Download Template feature will return 404) |
| Backend npm deps installed | Runs `npm install` on first run only |
| Frontend npm deps installed | Runs `npm install` on first run only |
| Database exists | Creates `tc_efficiency_db` automatically if absent |
| Migrations run | Applies `001_initial.sql` + `002_plan_module.sql` (idempotent) |
| Seed data loaded | Creates default roles, users, and system settings (idempotent) |
| Servers started | Backend on port 5000, frontend on port 5173 |

If `start.bat` completes successfully and all post-deployment checks in Section 7 pass locally, the IIS deployment is unlikely to encounter application-level issues.

---

## 3. Backend Deployment (IIS + IISNode)

### 3.1 Installation Prerequisites

**Step 1 — Install Node.js 20 LTS**

Download from https://nodejs.org/en/download and install to `C:\Program Files\nodejs\`. Verify:

```cmd
node --version    # v20.x.x
npm --version     # 10.x.x
```

**Step 2 — Install IISNode**

Download the IISNode installer from https://github.com/azure/iisnode/releases and run it. It installs the IIS handler module and registers it globally.

Verify the handler is registered in IIS:
```
IIS Manager → Server → Handler Mappings → confirm "iisnode" entry exists
```

**Step 3 — Install URL Rewrite Module**

Download from https://www.iis.net/downloads/microsoft/url-rewrite and install.

### 3.2 Deployment Folder Structure

Create the following directory structure:

```text
D:\Applications\TC-Efficiency\Backend\
├── src\
│   ├── server.js           ← IISNode entry point
│   ├── app.js
│   ├── config\
│   ├── controllers\
│   ├── middleware\
│   ├── migrations\
│   ├── models\
│   ├── routes\
│   ├── seeds\
│   └── services\
├── templates\
│   └── TC_Efficiency-Clean.xlsx   ← Plan Excel template
├── uploads\                        ← Created at runtime
├── logs\                           ← Created at runtime
├── node_modules\                   ← Created by npm ci
├── package.json
├── package-lock.json
├── .env                            ← Production environment config
└── web.config                      ← IISNode handler config
```

### 3.3 Build and Deploy

**Step 1 — Copy source files to server**

Copy the entire `backend/` folder from the repository to `D:\Applications\TC-Efficiency\Backend\`. Exclude `node_modules\`, `logs\`, and `uploads\`.

**Step 2 — Install production dependencies**

Open a Command Prompt as Administrator, navigate to the backend folder, and run:

```cmd
cd D:\Applications\TC-Efficiency\Backend
npm ci --only=production
```

This installs only production dependencies as locked in `package-lock.json`.

**Step 3 — Create the production `.env` file**

Create `D:\Applications\TC-Efficiency\Backend\.env` with the following content, replacing placeholder values:

```env
# Server
PORT=5000
NODE_ENV=production

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tc_efficiency_db
DB_USER=tc_efficiency_user
DB_PASSWORD=<YourStrongDatabasePassword>

# JWT — use a long random secret, min 64 characters
JWT_SECRET=<YourJWTSecretAtLeast64CharactersLong>
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# File Uploads
UPLOAD_DIR=D:\Applications\TC-Efficiency\Backend\uploads
MAX_FILE_SIZE=50mb

# Logging
LOG_LEVEL=info
LOG_DIR=D:\Applications\TC-Efficiency\Backend\logs

# CORS — must match the exact frontend URL (no trailing slash)
FRONTEND_URL=https://tc-efficiency.company.com

# Admin defaults (used only by the seed script — change after first login)
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@company.com
ADMIN_PASSWORD=<YourStrongAdminPassword>

# Plan Template
PLAN_TEMPLATE_PATH=D:\Applications\TC-Efficiency\Backend\templates\TC_Efficiency-Clean.xlsx
```

> **Security note:** Restrict `.env` file permissions so only the IIS App Pool identity can read it:
> ```cmd
> icacls "D:\Applications\TC-Efficiency\Backend\.env" /inheritance:r /grant "IIS AppPool\TC-Efficiency-Backend:(R)"
> ```

**Step 4 — Create the `web.config` for IISNode**

Create `D:\Applications\TC-Efficiency\Backend\web.config`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <handlers>
      <!-- Hand all requests to IISNode, which routes them to src/server.js -->
      <add name="iisnode"
           path="src/server.js"
           verb="*"
           modules="iisnode" />
    </handlers>

    <rewrite>
      <rules>
        <!-- Skip debugger traffic from rewrites -->
        <rule name="NodeInspector"
              patternSyntax="ECMAScript"
              stopProcessing="true">
          <match url="^src/server.js\/debug[\/]?" />
        </rule>

        <!-- Route all other requests to the Node entry point -->
        <rule name="DynamicContent">
          <conditions>
            <add input="{REQUEST_FILENAME}"
                 matchType="IsFile"
                 negate="True" />
          </conditions>
          <action type="Rewrite" url="src/server.js" />
        </rule>
      </rules>
    </rewrite>

    <security>
      <requestFiltering>
        <hiddenSegments>
          <remove segment="bin" />
        </hiddenSegments>
      </requestFiltering>
    </security>

    <!-- Let Express send its own error responses -->
    <httpErrors existingResponse="PassThrough" />

    <iisnode
      node_env="production"
      nodeProcessCommandLine="&quot;C:\Program Files\nodejs\node.exe&quot;"
      loggingEnabled="true"
      logDirectory="iisnode-logs"
      watchedFiles="web.config;*.js"
      maxConcurrentRequestsPerProcess="1024"
      maxProcessesPerApplication="2"
      gracefulShutdownTimeout="60000"
      recycleSignalEnabled="false"
    />
  </system.webServer>
</configuration>
```

### 3.4 Create Application Pool

Open **IIS Manager** and create a new Application Pool:

| Setting | Value |
|---------|-------|
| Name | `TC-Efficiency-Backend` |
| .NET CLR Version | **No Managed Code** |
| Managed Pipeline Mode | **Integrated** |
| Start Mode | **AlwaysRunning** |

Configure the App Pool further (right-click → Advanced Settings):

| Setting | Value |
|---------|-------|
| Identity | `NetworkService` or a dedicated service account |
| Idle Time-out (minutes) | `0` (never stop) |
| Regular Time Interval (minutes) | `1740` (recycle daily) |
| Disable Overlapped Recycle | `False` |
| Load User Profile | `True` |

### 3.5 Create the Backend IIS Website

1. In **IIS Manager**, right-click **Sites** → **Add Website**
2. Configure as follows:

| Setting | Value |
|---------|-------|
| Site Name | `TC-Efficiency-Backend` |
| Application Pool | `TC-Efficiency-Backend` |
| Physical Path | `D:\Applications\TC-Efficiency\Backend` |
| Binding Type | HTTP |
| IP Address | **127.0.0.1** (loopback only — never expose externally) |
| Port | `5000` |
| Host Name | *(leave blank)* |

> **Important:** Binding to `127.0.0.1` instead of `*` ensures the backend is only reachable from the server itself. All external access goes through ARR.

### 3.6 Folder Permissions

Grant the App Pool identity read/write access to the required folders:

```cmd
:: Read/Execute on application root
icacls "D:\Applications\TC-Efficiency\Backend" /grant "IIS AppPool\TC-Efficiency-Backend:(OI)(CI)RX" /T

:: Full control on uploads and logs (backend writes files here)
icacls "D:\Applications\TC-Efficiency\Backend\uploads" /grant "IIS AppPool\TC-Efficiency-Backend:(OI)(CI)F"
icacls "D:\Applications\TC-Efficiency\Backend\logs" /grant "IIS AppPool\TC-Efficiency-Backend:(OI)(CI)F"

:: Read-only on templates
icacls "D:\Applications\TC-Efficiency\Backend\templates" /grant "IIS AppPool\TC-Efficiency-Backend:(OI)(CI)R"
```

### 3.7 Verify Backend Is Running

After setup, test from the server itself:

```cmd
curl http://127.0.0.1:5000/api/health
```

Expected response:

```json
{"status":"ok","database":"connected","timestamp":"..."}
```

---

## 4. Frontend Deployment (IIS Static Site)

### 4.1 Build the Frontend

On the **build machine** (or CI server), not the production server:

```cmd
cd frontend
npm ci
npm run build
```

This produces the `frontend/dist/` folder containing the compiled React SPA. The build output includes:

```
dist/
├── index.html
├── assets/
│   ├── index-[hash].js
│   ├── index-[hash].css
│   └── ...
├── icons/
└── favicon.ico
```

### 4.2 Deployment Folder Structure

Copy the `dist/` contents to the production server:

```text
D:\Applications\TC-Efficiency\Frontend\
├── index.html
├── assets\
│   ├── index-[hash].js
│   ├── index-[hash].css
│   └── ...
├── icons\
├── favicon.ico
└── web.config          ← Create this (see Section 4.5)
```

### 4.3 Create Application Pool

| Setting | Value |
|---------|-------|
| Name | `TC-Efficiency-Frontend` |
| .NET CLR Version | **No Managed Code** |
| Managed Pipeline Mode | **Integrated** |
| Start Mode | **AlwaysRunning** |
| Identity | `ApplicationPoolIdentity` |
| Idle Time-out | `0` |

### 4.4 Create the Frontend IIS Website

1. Right-click **Sites** → **Add Website**

| Setting | Value |
|---------|-------|
| Site Name | `TC-Efficiency-Frontend` |
| Application Pool | `TC-Efficiency-Frontend` |
| Physical Path | `D:\Applications\TC-Efficiency\Frontend` |
| Binding (HTTP) | `*:80:tc-efficiency.company.com` |
| Binding (HTTPS) | `*:443:tc-efficiency.company.com` (select your SSL cert) |

2. For HTTP → HTTPS redirect, add an additional HTTP binding rule in web.config (see Section 4.5).

### 4.5 Frontend `web.config`

This file handles three responsibilities: API reverse proxy, SPA route fallback, and static asset caching.

Create `D:\Applications\TC-Efficiency\Frontend\web.config`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>

    <rewrite>
      <rules>

        <!-- 1. Redirect HTTP to HTTPS -->
        <rule name="HTTP to HTTPS" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{HTTPS}" pattern="^OFF$" ignoreCase="true" />
          </conditions>
          <action type="Redirect"
                  url="https://{HTTP_HOST}/{R:1}"
                  redirectType="Permanent" />
        </rule>

        <!-- 2. Reverse proxy /api/* to the backend (requires ARR) -->
        <rule name="API Reverse Proxy" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite"
                  url="http://127.0.0.1:5000/api/{R:1}" />
        </rule>

        <!-- 3. SPA fallback — serve index.html for all non-file/directory requests -->
        <rule name="SPA Fallback" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}"
                 matchType="IsFile"
                 negate="true" />
            <add input="{REQUEST_FILENAME}"
                 matchType="IsDirectory"
                 negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>

      </rules>

      <!-- Required for ARR reverse proxy passthrough -->
      <outboundRules>
        <rule name="Remove Backend Server Header">
          <match serverVariable="RESPONSE_Server" pattern=".*" />
          <action type="Rewrite" value="" />
        </rule>
      </outboundRules>
    </rewrite>

    <!-- Default document -->
    <defaultDocument>
      <files>
        <clear />
        <add value="index.html" />
      </files>
    </defaultDocument>

    <!-- Static content MIME types -->
    <staticContent>
      <!-- Long cache for hashed Vite assets -->
      <clientCache cacheControlMode="UseMaxAge"
                   cacheControlMaxAge="365.00:00:00" />
      <remove fileExtension=".woff2" />
      <mimeMap fileExtension=".woff2" mimeType="font/woff2" />
      <remove fileExtension=".woff" />
      <mimeMap fileExtension=".woff" mimeType="font/woff" />
      <remove fileExtension=".json" />
      <mimeMap fileExtension=".json" mimeType="application/json" />
      <remove fileExtension=".webmanifest" />
      <mimeMap fileExtension=".webmanifest"
               mimeType="application/manifest+json" />
    </staticContent>

    <!-- Security headers -->
    <httpProtocol>
      <customHeaders>
        <add name="X-Content-Type-Options" value="nosniff" />
        <add name="X-Frame-Options" value="SAMEORIGIN" />
        <add name="X-XSS-Protection" value="1; mode=block" />
        <add name="Referrer-Policy" value="strict-origin-when-cross-origin" />
        <add name="Strict-Transport-Security"
             value="max-age=31536000; includeSubDomains" />
      </customHeaders>
    </httpProtocol>

    <!-- Compress static assets -->
    <urlCompression doStaticCompression="true"
                    doDynamicCompression="true" />

  </system.webServer>
</configuration>
```

### 4.6 Enable ARR Reverse Proxy

ARR must be enabled server-wide for the proxy rule to work:

1. Open **IIS Manager** → click the server node → **Application Request Routing Cache**
2. In the Actions panel, click **Server Proxy Settings**
3. Check **Enable proxy**
4. Click **Apply**

### 4.7 Folder Permissions for Frontend

```cmd
icacls "D:\Applications\TC-Efficiency\Frontend" /grant "IIS AppPool\TC-Efficiency-Frontend:(OI)(CI)R" /T
```

The frontend pool only needs read access — all files are static.

---

## 5. Code Changes Required Before Deployment

### 5.1 API Base URL (No Change Needed for Same-Domain Deployment)

The React application uses a relative API URL:

```js
// frontend/src/services/api.js
const api = axios.create({
  baseURL: '/api',   // relative — works with ARR proxy on same domain
  ...
});
```

This works without modification because the ARR rule in `web.config` proxies `/api/*` from the frontend site to the backend. **No code change is needed** when deploying to the same domain with ARR.

**If deploying backend on a different domain** (e.g., `https://api.tc-efficiency.company.com`), change:

```js
// frontend/src/services/api.js  — only change if backend is on a different domain
const api = axios.create({
  baseURL: 'https://api.tc-efficiency.company.com/api',
  ...
});
```

And update CORS in the backend `.env`:

```env
FRONTEND_URL=https://tc-efficiency.company.com
```

### 5.3 Frontend Environment Files

Vite supports environment-specific files. Create `frontend/.env.production` before building:

```env
# frontend/.env.production
# Vite exposes variables prefixed with VITE_ to the browser bundle
# No additional variables are required for same-domain ARR deployment.
# Add any public build-time configuration here if needed in future.
VITE_APP_NAME=TC Efficiency Dashboard
VITE_APP_VERSION=1.0.0
```

For **different-domain** deployment only:

```env
VITE_API_BASE_URL=https://api.tc-efficiency.company.com/api
```

Then update `api.js` to use `import.meta.env.VITE_API_BASE_URL`.

### 5.4 Backend Environment Variables Summary

All backend configuration is loaded from `.env` at startup via `dotenv`. Every variable and its production value:

| Variable | Development Default | Production Value |
|----------|--------------------|--------------------|
| `PORT` | `5000` | `5000` |
| `NODE_ENV` | `development` | `production` |
| `DB_HOST` | `localhost` | DB server hostname or IP |
| `DB_PORT` | `5432` | `5432` |
| `DB_NAME` | `tc_efficiency_db` | `tc_efficiency_db` |
| `DB_USER` | `postgres` | `tc_efficiency_user` |
| `DB_PASSWORD` | `postgres` | Strong password |
| `JWT_SECRET` | *(development key)* | 64+ char random string |
| `JWT_EXPIRES_IN` | `24h` | `24h` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | `7d` |
| `UPLOAD_DIR` | `./uploads` | Full path: `D:\...\uploads` |
| `MAX_FILE_SIZE` | `50mb` | `50mb` |
| `LOG_LEVEL` | `info` | `info` (or `warn`) |
| `LOG_DIR` | `./logs` | Full path: `D:\...\logs` |
| `FRONTEND_URL` | `http://localhost:5173` | `https://tc-efficiency.company.com` |
| `ADMIN_USERNAME` | `admin` | `admin` |
| `ADMIN_EMAIL` | `admin@tc-efficiency.com` | Admin email address |
| `ADMIN_PASSWORD` | `Admin@123456` | Strong password (change post-deploy) |
| `PLAN_TEMPLATE_PATH` | `./templates/TC_Efficiency-Clean.xlsx` | Full path to template |

> **JWT_SECRET generation** — run once on the server to generate a secure secret:
> ```cmd
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

### 5.5 CORS Configuration

The backend permits requests only from the origin specified in `FRONTEND_URL`:

```js
// backend/src/app.js
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
```

Set `FRONTEND_URL` to exactly `https://tc-efficiency.company.com` (no trailing slash) in the backend `.env`.

### 5.6 File Path Configuration

All file paths should use absolute paths in production. Relative paths resolve from `process.cwd()`, which is the backend folder when running under IISNode.

| Path Variable | Dev (relative) | Production (absolute) |
|--------------|----------------|----------------------|
| `UPLOAD_DIR` | `./uploads` | `D:\Applications\TC-Efficiency\Backend\uploads` |
| `LOG_DIR` | `./logs` | `D:\Applications\TC-Efficiency\Backend\logs` |
| `PLAN_TEMPLATE_PATH` | `./templates/TC_Efficiency-Clean.xlsx` | `D:\Applications\TC-Efficiency\Backend\templates\TC_Efficiency-Clean.xlsx` |

---

## 6. Database Deployment

### 6.1 Install PostgreSQL

Download PostgreSQL 16 from https://www.postgresql.org/download/windows/ and install it as a Windows Service. During installation:

- Set the superuser (`postgres`) password — record it securely
- Keep default port: `5432`
- Ensure the PostgreSQL service starts automatically

### 6.2 Create the Application Database and User

Connect to PostgreSQL as superuser:

```cmd
psql -U postgres -h localhost
```

Run the following SQL:

```sql
-- Create dedicated application database user
CREATE USER tc_efficiency_user WITH PASSWORD 'YourStrongPassword';

-- Create the application database
CREATE DATABASE tc_efficiency_db
  WITH OWNER = tc_efficiency_user
       ENCODING = 'UTF8'
       LC_COLLATE = 'English_United States.1252'
       LC_CTYPE = 'English_United States.1252';

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE tc_efficiency_db TO tc_efficiency_user;

-- Exit
\q
```

### 6.3 Run Migrations

The migration script applies SQL files in order. Run from the backend folder:

```cmd
cd D:\Applications\TC-Efficiency\Backend
node src/migrations/migrate.js
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

Migration `001_initial.sql` creates the core tables. Migration `002_plan_module.sql` creates the Plan Dashboard tables. Both are idempotent (`CREATE TABLE IF NOT EXISTS`) and safe to run multiple times.

### 6.4 Run the Seed Script

The seed script creates default roles, users, and system settings:

```cmd
cd D:\Applications\TC-Efficiency\Backend
node src/seeds/seed.js
```

Expected output:

```
Seeded N program records from Excel.
Seed completed successfully.

Default Credentials:
  Admin   : admin / <ADMIN_PASSWORD from .env>
  Manager : manager / Manager@123
  Viewer  : viewer / Viewer@123
```

> **Note:** The seed script requires `TC_Efficiency_Measurement_Dashboard.xlsx` at `D:\2026\May\TC_Efficiency_Measurement_Dashboard\TC_Efficiency_Measurement_Dashboard.xlsx` (hardcoded path in the seed). If deploying to a new server without this Excel file, the seed will fail at the Excel parsing step but roles/users will already be committed. Re-run after placing the file, or manually create the initial upload via the UI.

### 6.5 Verify Database Tables

Connect to the database and verify all tables exist:

```sql
\c tc_efficiency_db

-- List all application tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected tables:

**Core tables** (from `001_initial.sql`):

| Table | Purpose |
|-------|---------|
| `roles` | User roles (admin, manager, viewer) |
| `users` | Application users |
| `upload_years` | Available years for legacy uploads |
| `uploaded_files` | Legacy Excel upload metadata |
| `programs` | Legacy program data (multi-column format) |
| `audit_logs` | User action audit trail |
| `notifications` | Per-user notifications |
| `sync_queue` | Unused (legacy offline-sync table, no longer written to) |
| `kpi_thresholds` | KPI alert thresholds |
| `scheduled_reports` | Scheduled report config |
| `dashboard_layouts` | Saved dashboard layouts |
| `system_settings` | Application configuration |

**Plan Dashboard tables** (from `002_plan_module.sql`):

| Table | Purpose |
|-------|---------|
| `plan_upload_years` | Available years for Plan uploads |
| `plan_uploaded_files` | Plan Excel upload metadata and validation reports |
| `plan_programs` | Plan program data — strict 14-column format |

**Validation queries:**

```sql
-- Confirm roles were seeded
SELECT name FROM roles ORDER BY name;
-- Expected: admin, manager, viewer

-- Confirm admin user exists
SELECT username, email FROM users WHERE username = 'admin';

-- Confirm system settings
SELECT key FROM system_settings ORDER BY key;

-- Confirm plan tables exist with correct columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'plan_programs'
ORDER BY ordinal_position;
-- Expected: 18 columns including estimated_hrs, actual_hrs,
--           total_effort_saved_hrs, total_effort_saved_euros,
--           total_cost_saved_euros

-- Confirm indexes
SELECT indexname FROM pg_indexes
WHERE tablename IN ('programs', 'plan_programs')
ORDER BY indexname;
```

### 6.6 Database Firewall

Ensure PostgreSQL only accepts connections from `localhost` (default). Verify in `postgresql.conf`:

```ini
# C:\Program Files\PostgreSQL\16\data\postgresql.conf
listen_addresses = 'localhost'
```

And in `pg_hba.conf`, ensure only local connections are allowed for the application user:

```
# C:\Program Files\PostgreSQL\16\data\pg_hba.conf
# TYPE  DATABASE            USER                  ADDRESS     METHOD
host    tc_efficiency_db    tc_efficiency_user    127.0.0.1/32  md5
```

---

## 7. Post-Deployment Verification

Run through this checklist after each deployment.

### 7.1 Verification Checklist

| # | Verification Item | How to Test | Expected Result |
|---|------------------|-------------|-----------------|
| 1 | HTTP redirects to HTTPS | Browse `http://tc-efficiency.company.com` | Automatically redirects to HTTPS |
| 2 | Frontend URL accessible | Browse `https://tc-efficiency.company.com` | Login page loads |
| 3 | Backend API health check | `curl https://tc-efficiency.company.com/api/health` | `{"status":"ok","database":"connected",...}` |
| 4 | Database connected | Check health endpoint response | `"database":"connected"` |
| 5 | Login working | Log in with admin credentials | Dashboard loads, JWT token issued |
| 6 | Plan Dashboard loading | Navigate to Plan Dashboard | KPI cards load with data (or "Upload a file" prompt) |
| 7 | Excel upload working | Upload `TC_Efficiency-Clean.xlsx` via Plan Upload | Records imported, validation report shown |
| 8 | Template download working | Click "Download Template" on Plan Upload page | `TC_Efficiency_Plan_Template.xlsx` downloads |
| 9 | KPI cards showing data | View Plan Dashboard after upload | 8 KPI cards show values, not dashes |
| 10 | Backend logs generated | Check `D:\Applications\TC-Efficiency\Backend\logs\` | `combined.log` and `error.log` exist and have entries |
| 11 | SPA routing working | Refresh the browser on `/plan/dashboard` | Page reloads correctly (no 404) |
| 12 | API docs accessible | Browse `https://tc-efficiency.company.com/api/docs` | Swagger UI loads |

### 7.2 Quick Smoke Test Commands

Run from the server (replace URL as needed):

```cmd
:: Health check
curl -k https://tc-efficiency.company.com/api/health

:: Login (expect a token in the response)
curl -k -X POST https://tc-efficiency.company.com/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"admin\",\"password\":\"YourAdminPassword\"}"

:: Template download (expect binary xlsx, no 404)
curl -k -I https://tc-efficiency.company.com/api/plan/template/download
:: Expected: HTTP/1.1 200 OK, Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

---

## 8. Troubleshooting Guide

### 8.1 Common Issues

| Issue | Possible Cause | Resolution |
|-------|---------------|------------|
| Backend site returns HTTP 500 on all requests | IISNode not installed, or `web.config` path wrong | Verify IISNode is installed; check `src/server.js` path in `web.config` handler |
| Backend site returns HTTP 503 Service Unavailable | Node.js process failed to start | Check IISNode logs in `D:\...\Backend\iisnode-logs\` for startup errors |
| `/api/health` returns 502 Bad Gateway from frontend | ARR proxy target unreachable | Confirm backend IIS site is running on `127.0.0.1:5000`; verify ARR server proxy is enabled |
| Login returns 500 error | Database connection failed | Check `.env` DB credentials; confirm PostgreSQL service is running; test with `psql -U tc_efficiency_user -h localhost tc_efficiency_db` |
| Login returns 401 | JWT_SECRET mismatch or missing | Ensure `JWT_SECRET` in `.env` is set and matches across restarts |
| CORS error in browser console | `FRONTEND_URL` mismatch | Set `FRONTEND_URL=https://tc-efficiency.company.com` (exact match, no trailing slash) in `.env` |
| SPA refresh returns HTTP 404 | URL Rewrite rule missing or not applied | Verify `web.config` SPA fallback rule; ensure URL Rewrite module is installed |
| Excel upload fails: "DATABASE_ERROR" | Migration not run, table missing | Run `node src/migrations/migrate.js`; verify `plan_programs` table exists |
| Template download returns 404 JSON | Template file not at configured path | Check `PLAN_TEMPLATE_PATH` in `.env`; verify file exists at that absolute path |
| KPI cards show wrong counts (e.g., 2 programs) | Year filter applied incorrectly | Default filter is "All Years" — if seeing only 2, browser localStorage may have cached an old year filter; clear localStorage and reload |
| Uploaded files not saved | `UPLOAD_DIR` is not writable | Grant write permissions: `icacls "...\uploads" /grant "IIS AppPool\TC-Efficiency-Backend:(OI)(CI)F"` |
| Logs not created | `LOG_DIR` is not writable | Same fix as uploads — grant write access to the logs folder |
| ARR proxy rewrites responses incorrectly | ARR caching enabled | Disable ARR disk caching in **IIS → ARR → Server Proxy Settings → Disk Cache** |
| IIS Application Pool stops unexpectedly | Node.js unhandled exception | Review `iisnode-logs\` for stack traces; review `logs\error.log` |
| Slow first request (cold start) | App Pool idle timeout recycles the process | Set App Pool **Idle Time-out = 0** and **Start Mode = AlwaysRunning** |

### 8.2 Log File Locations

| Log | Path | Purpose |
|-----|------|---------|
| Application (combined) | `D:\Applications\TC-Efficiency\Backend\logs\combined.log` | All request and info logs |
| Application (errors) | `D:\Applications\TC-Efficiency\Backend\logs\error.log` | Error-level logs only |
| Application (audit) | `D:\Applications\TC-Efficiency\Backend\logs\audit.log` | User action audit trail |
| IISNode process | `D:\Applications\TC-Efficiency\Backend\iisnode-logs\` | Node.js stdout/stderr |
| IIS access log | `C:\inetpub\logs\LogFiles\W3SVC*\` | HTTP access log (IIS native) |

### 8.3 Checking Service Status

```cmd
:: Check IIS application pool status
%windir%\system32\inetsrv\appcmd.exe list apppool /processModel.userName:* /state:*

:: Restart the backend app pool
%windir%\system32\inetsrv\appcmd.exe recycle apppool /apppool.name:"TC-Efficiency-Backend"

:: Check PostgreSQL service
sc query postgresql-x64-16

:: Test DB connection
psql -U tc_efficiency_user -h localhost -d tc_efficiency_db -c "SELECT 1;"
```

---

## 9. Rollback Procedure

### 9.1 Before Any Deployment

Always take a snapshot before deploying:

```cmd
:: 1. Backup the database
pg_dump -U postgres -Fc -f "D:\Backups\tc_efficiency_db_%date:~-4,4%%date:~-10,2%%date:~-7,2%.dump" tc_efficiency_db

:: 2. Backup current frontend files
xcopy /E /I /Y "D:\Applications\TC-Efficiency\Frontend" "D:\Backups\Frontend-pre-deploy-%date:~-4,4%%date:~-10,2%%date:~-7,2%"

:: 3. Backup current backend files (excluding node_modules and logs)
robocopy "D:\Applications\TC-Efficiency\Backend" "D:\Backups\Backend-pre-deploy-%date:~-4,4%%date:~-10,2%%date:~-7,2%" /E /XD node_modules logs iisnode-logs
```

### 9.2 Frontend Rollback

The frontend is stateless — rolling back means replacing the `dist/` files:

```cmd
:: Stop frontend site
%windir%\system32\inetsrv\appcmd.exe stop site /site.name:"TC-Efficiency-Frontend"

:: Replace with backup
xcopy /E /I /Y "D:\Backups\Frontend-pre-deploy-YYYYMMDD\*" "D:\Applications\TC-Efficiency\Frontend\"

:: Restart frontend site
%windir%\system32\inetsrv\appcmd.exe start site /site.name:"TC-Efficiency-Frontend"
```

### 9.3 Backend Rollback

```cmd
:: Recycle the app pool (graceful shutdown)
%windir%\system32\inetsrv\appcmd.exe recycle apppool /apppool.name:"TC-Efficiency-Backend"

:: Replace backend source files (keep .env and uploads intact)
robocopy "D:\Backups\Backend-pre-deploy-YYYYMMDD" "D:\Applications\TC-Efficiency\Backend" /E /XD node_modules logs uploads

:: Reinstall dependencies from restored package-lock.json
cd D:\Applications\TC-Efficiency\Backend
npm ci --only=production

:: Recycle again to pick up restored code
%windir%\system32\inetsrv\appcmd.exe recycle apppool /apppool.name:"TC-Efficiency-Backend"
```

### 9.4 Database Rollback

```cmd
:: Stop the application first (prevents writes during restore)
%windir%\system32\inetsrv\appcmd.exe stop apppool /apppool.name:"TC-Efficiency-Backend"

:: Drop and restore the database
psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='tc_efficiency_db' AND pid <> pg_backend_pid();"
psql -U postgres -c "DROP DATABASE IF EXISTS tc_efficiency_db;"
psql -U postgres -c "CREATE DATABASE tc_efficiency_db WITH OWNER = tc_efficiency_user ENCODING = 'UTF8';"
pg_restore -U postgres -d tc_efficiency_db "D:\Backups\tc_efficiency_db_YYYYMMDD.dump"

:: Restart application
%windir%\system32\inetsrv\appcmd.exe start apppool /apppool.name:"TC-Efficiency-Backend"
```

### 9.5 Validate Rollback

After rollback, re-run the post-deployment verification checklist in Section 7.

---

## 10. Deployment Best Practices

### 10.1 Environment-Specific Configuration

- Never commit `.env` files to version control. Use `.env.example` as a template with placeholder values.
- Maintain separate `.env` files for Development, UAT, and Production environments.
- Store production secrets in a secrets manager (e.g., Azure Key Vault, HashiCorp Vault) and inject at deploy time.
- Use a dedicated PostgreSQL user (`tc_efficiency_user`) with minimum required privileges — never use the `postgres` superuser for the application.

### 10.2 Version Control for Deployments

- Tag every release in git: `git tag -a v1.0.0 -m "Production release 2026-06-25"`
- Record the git commit hash in each deployment: `node -e "console.log(require('child_process').execSync('git rev-parse HEAD').toString().trim())"` and store it in `system_settings`.
- Keep the backup files from Section 9.1 labelled with the git tag being replaced.

### 10.3 Database Backup Policy

| Backup Type | Frequency | Retention |
|-------------|-----------|-----------|
| Full dump | Daily (scheduled task) | 30 days |
| Pre-deployment snapshot | Before every deployment | Keep last 5 |
| Weekly archive | Weekly | 12 weeks |

Automate daily backups with a Windows Task Scheduler job:

```cmd
:: D:\Scripts\backup-db.cmd
set DATESTAMP=%date:~-4,4%%date:~-10,2%%date:~-7,2%
pg_dump -U postgres -Fc -f "D:\Backups\Daily\tc_efficiency_db_%DATESTAMP%.dump" tc_efficiency_db
```

### 10.4 Health Checks and Monitoring

The backend exposes a health endpoint at `/api/health` that checks database connectivity. Use Windows Task Scheduler or an external monitoring tool to poll it every 5 minutes:

```powershell
# PowerShell health check script
$response = Invoke-WebRequest -Uri "https://tc-efficiency.company.com/api/health" -UseBasicParsing
if ($response.StatusCode -ne 200) {
    Send-MailMessage -To "ops@company.com" -Subject "TC Dashboard DOWN" -Body $response.Content
}
```

### 10.5 SSL Enforcement

The frontend `web.config` includes an HTTP→HTTPS redirect rule and `Strict-Transport-Security` header (HSTS). Verify:

1. The HSTS header is present: `curl -I https://tc-efficiency.company.com` → look for `Strict-Transport-Security`.
2. The HTTP redirect works: `curl -I http://tc-efficiency.company.com` → look for `301 Moved Permanently`.

Do not remove the HSTS header once deployed to production browsers — it is cached by users and removing it mid-deployment causes access issues.

### 10.6 Log Rotation

Winston is configured to rotate logs automatically:

- `error.log`: max 10 MB, keeps 5 files
- `combined.log`: max 20 MB, keeps 10 files
- `audit.log`: max 20 MB, keeps 30 files

For IISNode's own logs (`iisnode-logs/`), configure rotation in IIS Manager or add a scheduled cleanup script.

### 10.7 Secrets Rotation

Rotate the following secrets on a schedule or after any suspected compromise:

| Secret | Rotation Frequency | Impact of Rotation |
|--------|-------------------|-------------------|
| `JWT_SECRET` | Annually (or after incident) | All active sessions are invalidated — users must log in again |
| `DB_PASSWORD` | Quarterly | Update `.env` and recycle App Pool |
| `ADMIN_PASSWORD` | After first login, then annually | Change via the UI after first login |

### 10.8 UAT vs Production Differences

| Setting | UAT | Production |
|---------|-----|-----------|
| `NODE_ENV` | `development` or `uat` | `production` |
| `LOG_LEVEL` | `debug` | `info` |
| `FRONTEND_URL` | UAT URL | Production URL |
| `JWT_SECRET` | Separate secret | Separate secret |
| Database | Separate `tc_efficiency_db_uat` | `tc_efficiency_db` |
| SSL Certificate | Self-signed or Let's Encrypt | Enterprise PKI |

Always test a deployment on UAT before applying to Production.
