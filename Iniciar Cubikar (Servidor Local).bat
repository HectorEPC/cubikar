@echo off
chcp 65001 >nul
title Cubikar - Servidor Local
cls
echo =======================================================================
echo                       CUBIKAR - CONTROL DE OBRA
echo =======================================================================
echo.
echo Iniciando servidor local en http://localhost:8000 ...
echo Abriendo Cubikar en tu navegador con soporte completo para Google OAuth...
echo.
echo (Para cerrar el servidor, simplemente cierra esta ventana de consola)
echo =======================================================================
echo.

set "PY_EXE=C:\Users\hepc9\AppData\Local\Programs\Python\Python314\python.exe"

start "" "http://localhost:8000/index.html"

if exist "%PY_EXE%" (
    "%PY_EXE%" -m http.server 8000
) else (
    py -m http.server 8000 2>nul || python -m http.server 8000
)

pause
