@echo off
chcp 65001 >nul
echo ========================================
echo   Video AI Studio - Dev
echo ========================================
echo.

cd /d "%~dp0"

if not exist "node_modules" (
    echo [INFO] node_modules not found, installing...
    call pnpm install
    if errorlevel 1 (
        echo [ERROR] pnpm install failed
        pause
        exit /b 1
    )
)

call pnpm dev
