@echo off
cd /d %~dp0
start "" /min cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:5173"
npm run dev