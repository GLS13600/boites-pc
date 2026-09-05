@echo off
setlocal enabledelayedexpansion
title Pokedex - serveur de developpement
cd /d "%~dp0"

echo ==========================================
echo   BOITES PC - serveur de developpement
echo ==========================================
echo.

REM --- 1. Trouver le dossier du projet (ici, ou un sous-dossier) ---
set "PROJET="
if exist "package.json" set "PROJET=%cd%"

if not defined PROJET (
  for /d %%D in (*) do (
    if exist "%%D\package.json" set "PROJET=%cd%\%%D"
  )
)
if not defined PROJET (
  for /d %%D in (*) do (
    for /d %%E in ("%%D\*") do (
      if exist "%%E\package.json" set "PROJET=%cd%\%%E"
    )
  )
)

if not defined PROJET (
  echo [ERREUR] Aucun package.json trouve.
  echo Place ce fichier dans D:\Code\Jeu, a cote du dossier du projet.
  echo.
  pause
  exit /b 1
)

cd /d "!PROJET!"
echo Projet : !PROJET!
echo.

REM --- 2. Verifier Node.js ---
where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js est introuvable.
  echo Installe la version LTS depuis nodejs.org, puis relance ce fichier.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%V in ('node -v') do echo Node.js %%V

REM --- 3. Installer les dependances au premier lancement ---
if not exist "node_modules" (
  echo.
  echo Premier lancement : installation des dependances...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERREUR] npm install a echoue.
    pause
    exit /b 1
  )
)

REM --- 4. Afficher l'adresse a ouvrir sur l'iPhone ---
echo.
echo Adresses pour l'iPhone (meme Wi-Fi ou partage de connexion) :
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "IP=%%A"
  set "IP=!IP: =!"
  echo    http://!IP!:5173
)
echo.
echo Sur ce PC : http://localhost:5173
echo Ctrl+C pour arreter le serveur.
echo ------------------------------------------
echo.

REM --- 5. Ouvrir le navigateur puis lancer Vite ---
start "" http://localhost:5173
call npm run dev

echo.
echo Serveur arrete.
pause
