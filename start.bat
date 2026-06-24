@echo off
title TC Efficiency Measurement Dashboard
color 0A
cls

echo ===============================================================
echo   TC Efficiency Measurement Dashboard
echo   Technology Center - Enterprise Analytics Platform
echo ===============================================================
echo.

:: ── Prerequisite checks ────────────────────────────────────────

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed. Please install Node.js 20+ from nodejs.org
    pause
    exit /b 1
)

:: Warn if Node.js is older than v20
for /f "tokens=1 delims=v." %%a in ('node --version 2^>nul') do set NODE_MAJOR=%%a
for /f "tokens=2 delims=v." %%a in ('node --version 2^>nul') do set NODE_MAJOR=%%a
node -e "if(parseInt(process.versions.node)<20){process.exit(1)}" >nul 2>&1
if errorlevel 1 (
    echo [WARN] Node.js version is below 20. This project requires Node.js 20+.
    echo        Current version: && node --version
    echo        Download 20 LTS from: https://nodejs.org
    echo.
)

:: Check PostgreSQL client
psql --version >nul 2>&1
if errorlevel 1 (
    echo [WARN] psql not found in PATH. Make sure PostgreSQL is running on port 5432.
)

:: ── Environment file check ──────────────────────────────────────

if not exist "%~dp0backend\.env" (
    echo.
    echo [WARN] backend\.env not found.
    echo        The backend will start with built-in defaults, which may not match
    echo        your PostgreSQL credentials. It is strongly recommended to create
    echo        backend\.env before proceeding.
    echo.
    echo        Minimum required content:
    echo          DB_HOST=localhost
    echo          DB_PORT=5432
    echo          DB_NAME=tc_efficiency_db
    echo          DB_USER=postgres
    echo          DB_PASSWORD=your_postgres_password
    echo          JWT_SECRET=change-this-to-a-long-random-string
    echo          FRONTEND_URL=http://localhost:5173
    echo          PLAN_TEMPLATE_PATH=./templates/TC_Efficiency-Clean.xlsx
    echo.
    echo        See README.md Section 3 for the full template.
    echo.
    choice /c YN /m "Continue without .env (Y) or exit to create it first (N)?"
    if errorlevel 2 (
        echo Exiting. Create backend\.env and re-run start.bat.
        pause
        exit /b 1
    )
)

:: ── Template file check ─────────────────────────────────────────

if not exist "%~dp0backend\templates\TC_Efficiency-Clean.xlsx" (
    echo.
    echo [WARN] Plan Excel template not found:
    echo        backend\templates\TC_Efficiency-Clean.xlsx
    echo.
    echo        The "Download Template" button on the Plan Upload page will return
    echo        a 404 error until this file is present.
    echo        Copy TC_Efficiency-Clean.xlsx into backend\templates\ to resolve.
    echo.
)

:: ────────────────────────────────────────────────────────────────

echo [1/6] Checking backend dependencies...
cd /d "%~dp0backend"
if not exist node_modules (
    echo Installing backend dependencies...
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo [ERROR] Failed to install backend dependencies.
        pause & exit /b 1
    )
    echo Backend dependencies installed.
) else (
    echo Backend dependencies already installed.
)

echo.
echo [2/6] Checking frontend dependencies...
cd /d "%~dp0frontend"
if not exist node_modules (
    echo Installing frontend dependencies...
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo [ERROR] Failed to install frontend dependencies.
        pause & exit /b 1
    )
    echo Frontend dependencies installed.
) else (
    echo Frontend dependencies already installed.
)

echo.
echo [3/6] Creating database if not exists...
cd /d "%~dp0backend"
psql -U postgres -h localhost -c "SELECT 1 FROM pg_database WHERE datname='tc_efficiency_db'" 2>nul | findstr /c:"1 row" >nul
if errorlevel 1 (
    echo Creating database tc_efficiency_db...
    psql -U postgres -h localhost -c "CREATE DATABASE tc_efficiency_db"
    if errorlevel 1 (
        echo [WARN] Could not auto-create database. Please create it manually:
        echo   psql -U postgres -c "CREATE DATABASE tc_efficiency_db"
    ) else (
        echo Database created.
    )
) else (
    echo Database already exists.
)

echo.
echo [4/6] Running migrations...
cd /d "%~dp0backend"
node src/migrations/migrate.js
if errorlevel 1 (
    echo [WARN] Migration may have had issues. Check if tables already exist.
)
echo Migrations done.

echo.
echo [5/6] Seeding initial data...
cd /d "%~dp0backend"
node src/seeds/seed.js
echo Seed complete.

echo.
echo [6/6] Starting servers...
echo.

:: Start backend in background window
start "TC-Backend (Port 5000)" cmd /k "cd /d "%~dp0backend" && echo Starting TC Efficiency Backend... && node src/server.js"

:: Wait for backend to start
echo Waiting for backend to start...
timeout /t 4 /nobreak >nul

:: Start frontend in background window
start "TC-Frontend (Port 5173)" cmd /k "cd /d "%~dp0frontend" && echo Starting TC Efficiency Frontend... && npm run dev"

:: Wait for frontend to start
echo Waiting for frontend to start...
timeout /t 5 /nobreak >nul

echo.
echo ===============================================================
echo   APPLICATION STARTED SUCCESSFULLY!
echo ---------------------------------------------------------------
echo   Frontend    : http://localhost:5173
echo   Backend API : http://localhost:5000
echo   API Docs    : http://localhost:5000/api/docs
echo   Health      : http://localhost:5000/api/health
echo ---------------------------------------------------------------
echo   Plan Dashboard : http://localhost:5173/plan/dashboard
echo   Plan Upload    : http://localhost:5173/plan/upload
echo   Template DL    : http://localhost:5000/api/plan/template/download
echo ---------------------------------------------------------------
echo   LOGIN CREDENTIALS:
echo   Admin   : admin / Admin@123456
echo   Manager : manager / Manager@123
echo   Viewer  : viewer / Viewer@123
echo ---------------------------------------------------------------
echo   Close the backend and frontend windows to stop the app.
echo   Or run stop.bat to terminate all processes.
echo ===============================================================
echo.

:: Open browser
start "" http://localhost:5173

pause
