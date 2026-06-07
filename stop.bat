@echo off
title TC Efficiency Dashboard - Stopping
color 0C
echo.
echo Stopping TC Efficiency Measurement Dashboard...
echo.

:: Kill processes on backend port 5000
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5000 " ^| findstr "LISTENING"') do (
    if not "%%a"=="" (
        taskkill /F /PID %%a >nul 2>&1
        echo Stopped backend (PID %%a)
    )
)

:: Kill processes on frontend port 5173
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    if not "%%a"=="" (
        taskkill /F /PID %%a >nul 2>&1
        echo Stopped frontend (PID %%a)
    )
)

:: Also close named windows if they exist
taskkill /FI "WINDOWTITLE eq TC-Backend (Port 5000)" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq TC-Frontend (Port 5173)" /F >nul 2>&1

echo.
echo All TC Efficiency servers stopped.
echo.
timeout /t 2 /nobreak >nul
