@echo off
echo Starting Node.js Express backend...
cd /d "%~dp0"
if not exist node_modules (
    npm install
)
node app.js
pause
