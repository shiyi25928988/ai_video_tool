@echo off
chcp 65001 >nul
echo ========================================
echo   Video AI Studio - Dev
echo ========================================
echo.

cd /d "%~dp0"

call pnpm install --frozen-lockfile
if errorlevel 1 (
    echo [ERROR] pnpm install failed
    pause
    exit /b 1
)

call npx electron-vite dev
