@echo off
echo ==========================================
echo  MMS Web - Start Redis + Backend + Frontend
echo ==========================================
echo.
echo NOTE: Using LOCAL PostgreSQL on port 5433 (postgres/postgres/MMS)
echo.

echo [1/3] Starting Redis (Docker)...
docker-compose up -d redis
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Redis failed to start. Backend will use in-memory cache.
)

echo.
echo [2/3] Starting Backend (NestJS - port 3000)...
start "MMS Backend" cmd /k "cd /d %~dp0Web\backend && npx nest build && npx nest start"

echo Waiting 5s for backend to initialize...
timeout /t 5 /nobreak >nul

echo.
echo [3/3] Starting Frontend (Vite React - port 5173)...
start "MMS Frontend" cmd /k "cd /d %~dp0Web\frontend && npm run dev"

echo.
echo ==========================================
echo  Services started!
echo  - PostgreSQL: localhost:5433 (local install)
echo  - Redis:      localhost:6379 (Docker)
echo  - Backend:    http://localhost:3000/api/v1/mms_core
echo  - Frontend:   http://localhost:5173
echo ==========================================
echo.
echo Login demo:
echo   admin   / Admin@123
echo   dqtv01  / Dqtv@123
echo.
pause
