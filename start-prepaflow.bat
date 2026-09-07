@echo off
cd /d "%~dp0dist"
where py >nul 2>nul
if errorlevel 1 (
  start "" index.html
  exit /b
)
start "" http://localhost:8080
py -m http.server 8080 --bind 127.0.0.1
