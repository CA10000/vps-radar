@echo off
chcp 65001 >nul
title VPS 雷达
cd /d "%~dp0"

echo.
echo   ========================================
echo      VPS 雷达 · 免费服务器情报聚合
echo   ========================================
echo.

where bun >nul 2>&1
if errorlevel 1 (
  echo   [错误] 未找到 bun，请先安装：https://bun.sh
  pause
  exit /b 1
)

echo   正在启动服务...
echo   启动后请用浏览器打开：http://127.0.0.1:8090
echo   关闭此窗口即可停止服务
echo.

bun run server.js

pause
