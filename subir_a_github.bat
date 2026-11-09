@echo off
chcp 65001 > nul
title Subir Cubikar a GitHub
echo ====================================================
echo           SUBIENDO CUBIKAR A GITHUB
echo ====================================================
echo.
echo Conectando con https://github.com/HectorEPC/cubikar ...
echo (Si tu navegador abre una pestana pidiendo autorizacion, haz clic en "Sign in" o "Authorize")
echo.
git push -u origin main
if %ERRORLEVEL% equ 0 (
    echo.
    echo ====================================================
    echo    ¡EXITO! El proyecto se subio correctamente.
    echo ====================================================
    echo Ya puedes ir a Vercel a conectar tu proyecto y cubikar.app
) else (
    echo.
    echo ====================================================
    echo    Hubo un aviso al subir. Revisa tu conexion.
    echo ====================================================
)
echo.
pause
