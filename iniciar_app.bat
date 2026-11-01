@echo off
chcp 65001 > nul
title Sistema de Control de Obra
echo ==========================================================
echo    INICIANDO SISTEMA DE CONTROL DE OBRA...
echo ==========================================================
echo Abriendo servidor local y cargando modulos ES6...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar_app.ps1"
if %errorlevel% neq 0 (
    echo.
    echo Ocurrio un problema al iniciar el servidor local.
    pause
)
