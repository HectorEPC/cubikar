@echo off
title Subir Cubikar a GitHub
cls
echo ====================================================
echo           SUBIENDO CUBIKAR A GITHUB
echo ====================================================
echo.
echo Conectando con https://github.com/HectorEPC/cubikar ...
echo.
git push -u origin main
if %ERRORLEVEL% equ 0 (
    echo.
    echo ====================================================
    echo    EXITO: El proyecto se subio correctamente.
    echo ====================================================
    echo Cloudflare Pages actualizara automaticamente el despliegue en produccion.
) else (
    echo.
    echo ====================================================
    echo    Hubo un problema al subir. Revisa tu conexion.
    echo ====================================================
)
echo.
pause