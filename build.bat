@echo off
chcp 65001 >nul
echo ========================================
echo   Video AI Studio - Build
echo ========================================
echo.

cd /d "%~dp0"

call pnpm install --frozen-lockfile
if errorlevel 1 (
    echo [ERROR] pnpm install failed
    pause
    exit /b 1
)

call npx electron-vite build
if errorlevel 1 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)

echo.
echo [OK] Build complete
pause
