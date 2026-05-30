@echo off
chcp 65001 >nul
echo ========================================
echo   Kill Sidecar Process
echo ========================================
echo.

:: 查找占用 18923 端口的进程并杀掉
set "FOUND=0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :18923 ^| findstr LISTENING') do (
    echo [KILL] 端口 18923 进程 PID=%%a
    taskkill /F /PID %%a
    set "FOUND=1"
)

if "%FOUND%"=="0" (
    echo [INFO] 端口 18923 无进程占用
)

echo.
echo [OK] 完成
pause
