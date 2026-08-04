@echo off
rem Start Aniso Paint's local development server from any folder.
cd /d "%~dp0"
call npm.cmd run dev
