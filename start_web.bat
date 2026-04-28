@echo off
title MMS - Start Web System

echo.
echo  =====================================================
echo   MMS - He Thong Quan Ly Luc Luong BVANTTAT
echo   Dang khoi dong...
echo  =====================================================
echo.

cd /d "%~dp0"

:: --- 1. Check Docker ---
echo [1/4] Kiem tra Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo       Docker chua chay. Dang mo Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo       Cho Docker san sang (toi da 60 giay)...
    set tries=0
    :WAIT_DOCKER
    timeout /t 3 /nobreak >nul
    docker info >nul 2>&1
    if errorlevel 1 (
        set /a tries+=1
        if %tries% lss 20 goto WAIT_DOCKER
        echo.
        echo  [LOI] Khong the ket noi Docker. Vui long mo Docker Desktop thu cong.
        pause
        exit /b 1
    )
)
echo       Docker OK.

:: --- 2. Start PostgreSQL + Redis ---
echo [2/4] Khoi dong PostgreSQL va Redis...
docker-compose up -d postgres redis >nul 2>&1

echo       Cho PostgreSQL san sang...
set db_tries=0
:WAIT_DB
timeout /t 2 /nobreak >nul
docker-compose exec -T postgres pg_isready -U postgres >nul 2>&1
if errorlevel 1 (
    set /a db_tries+=1
    if %db_tries% lss 15 goto WAIT_DB
    echo  [LOI] PostgreSQL khong khoi dong duoc.
    pause
    exit /b 1
)
echo       PostgreSQL OK - port 5433
echo       Redis OK - port 6379

:: --- 3. Start Backend ---
echo [3/4] Khoi dong Backend NestJS (port 3000)...
start "MMS Backend" cmd /k "cd /d %~dp0Web\backend && npm run start:dev"

echo       Cho Backend san sang...
set be_tries=0
:WAIT_BE
timeout /t 3 /nobreak >nul
curl -s http://localhost:3000 >nul 2>&1
if errorlevel 1 (
    set /a be_tries+=1
    if %be_tries% lss 20 goto WAIT_BE
)
echo       Backend OK.

:: --- 4. Start Frontend ---
echo [4/4] Khoi dong Frontend Vite (port 5173)...
start "MMS Frontend" cmd /k "cd /d %~dp0Web\frontend && npm run dev"

echo       Cho Frontend san sang...
set fe_tries=0
:WAIT_FE
timeout /t 2 /nobreak >nul
curl -s http://localhost:5173 >nul 2>&1
if errorlevel 1 (
    set /a fe_tries+=1
    if %fe_tries% lss 15 goto WAIT_FE
)

:: --- Done ---
echo.
echo  =====================================================
echo   He thong da san sang!
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:3000/api/v1/mms_core
echo   Database : localhost:5433  (DB: MMS)
echo  =====================================================
echo.
echo   Dang mo trinh duyet...

start "" "http://localhost:5173"

echo.
echo   Nhan phim bat ky de dong cua so nay.
echo   (Backend va Frontend van chay trong cac cua so rieng)
pause >nul
