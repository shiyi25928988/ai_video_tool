@echo off
chcp 65001 >nul
echo ========================================
echo   Video AI Studio - Clean Environment
echo ========================================
echo.

setlocal enabledelayedexpansion

set "ROOT=%~dp0"
set "CLEANED=0"
set "SKIPPED=0"

:: --- node_modules ---
if exist "%ROOT%node_modules" (
    echo [DEL] node_modules\
    rmdir /s /q "%ROOT%node_modules"
    set /a CLEANED+=1
) else (
    echo [SKIP] node_modules\ (not found)
    set /a SKIPPED+=1
)

:: --- out (electron-vite build output) ---
if exist "%ROOT%out" (
    echo [DEL] out\
    rmdir /s /q "%ROOT%out"
    set /a CLEANED+=1
) else (
    echo [SKIP] out\ (not found)
    set /a SKIPPED+=1
)

:: --- release (electron-builder output) ---
if exist "%ROOT%release" (
    echo [DEL] release\
    rmdir /s /q "%ROOT%release"
    set /a CLEANED+=1
) else (
    echo [SKIP] release\ (not found)
    set /a SKIPPED+=1
)

:: --- dist ---
if exist "%ROOT%dist" (
    echo [DEL] dist\
    rmdir /s /q "%ROOT%dist"
    set /a CLEANED+=1
) else (
    echo [SKIP] dist\ (not found)
    set /a SKIPPED+=1
)

:: --- dist-electron ---
if exist "%ROOT%dist-electron" (
    echo [DEL] dist-electron\
    rmdir /s /q "%ROOT%dist-electron"
    set /a CLEANED+=1
) else (
    echo [SKIP] dist-electron\ (not found)
    set /a SKIPPED+=1
)

:: --- .sidecar (Python venv / temp) ---
if exist "%ROOT%.sidecar" (
    echo [DEL] .sidecar\
    rmdir /s /q "%ROOT%.sidecar"
    set /a CLEANED+=1
) else (
    echo [SKIP] .sidecar\ (not found)
    set /a SKIPPED+=1
)

:: --- __pycache__ (Python bytecode) ---
echo.
echo [SCAN] Searching for __pycache__ directories...
set "PYCOUNT=0"
for /r "%ROOT%" /d %%d in (__pycache__) do (
    echo   [DEL] %%d
    rmdir /s /q "%%d"
    set /a PYCOUNT+=1
)
if !PYCOUNT! EQU 0 (
    echo   (none found)
) else (
    set /a CLEANED+=!PYCOUNT!
)

:: --- .pyc files ---
echo.
echo [SCAN] Searching for .pyc files...
set "PYC_COUNT=0"
for /r "%ROOT%" %%f in (*.pyc) do (
    echo   [DEL] %%f
    del /q "%%f"
    set /a PYC_COUNT+=1
)
if !PYC_COUNT! EQU 0 (
    echo   (none found)
) else (
    set /a CLEANED+=!PYC_COUNT!
)

:: --- Log files ---
echo.
echo [SCAN] Searching for *.log files...
set "LOG_COUNT=0"
for %%f in ("%ROOT%*.log") do (
    echo   [DEL] %%f
    del /q "%%f"
    set /a LOG_COUNT+=1
)
if !LOG_COUNT! EQU 0 (
    echo   (none found)
) else (
    set /a CLEANED+=!LOG_COUNT!
)

:: --- .env.local ---
if exist "%ROOT%.env.local" (
    echo.
    echo [DEL] .env.local
    del /q "%ROOT%.env.local"
    set /a CLEANED+=1
)

echo.
echo ========================================
echo   Done. Cleaned: !CLEANED!  Skipped: !SKIPPED!
echo ========================================
echo.
echo To reinstall dependencies, run:  pnpm install
echo To rebuild, run:                 pnpm build
echo.
endlocal
pause
