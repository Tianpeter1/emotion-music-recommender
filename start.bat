@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [X] 未检测到 Node.js。
  echo     请安装 Node.js，或改用：python -m http.server 8080
  echo     然后浏览器打开 http://localhost:8080
  pause
  exit /b 1
)

echo.
echo  ============================================
echo   人脸情绪识别 . 歌曲推荐系统
echo   正在启动本地服务器，请保持本窗口开启
echo   浏览器将自动打开 http://localhost:8080
echo   停止服务：关闭本窗口 或 按 Ctrl+C
echo  ============================================
echo.

REM 延迟 2 秒后再开浏览器，确保服务已就绪
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8080'"

node server.js
pause
