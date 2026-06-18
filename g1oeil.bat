@echo off
cd /d %~dp0
start /B "" powershell -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:5173'"
npm run dev