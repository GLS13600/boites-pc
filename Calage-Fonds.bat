@echo off
setlocal enabledelayedexpansion
title Calage des fonds de boite
cd /d "%~dp0"

echo ==========================================
echo   CALAGE DES FONDS DE BOITE
echo ==========================================
echo.
echo Deux fenetres vont s'ouvrir cote a cote :
echo   - a gauche  : l'appli, pour voir les boites en direct
echo   - a droite  : les curseurs de positionnement
echo.
echo Quand un calage vous convient, cliquez sur "Copier la ligne"
echo et collez-la dans src\paper-align.js
echo.

REM --- Verifier le projet ---
if not exist "package.json" (
  echo [ERREUR] package.json introuvable. Placez ce fichier a la racine du projet.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js est introuvable. Installez la version LTS depuis nodejs.org.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Premier lancement : installation des dependances...
  call npm install
  if errorlevel 1 ( echo [ERREUR] npm install a echoue. & pause & exit /b 1 )
)

REM --- Demarrer le serveur seulement s'il ne tourne pas deja ---
netstat -ano | findstr /c:":5173" | findstr /c:"LISTENING" >nul
if errorlevel 1 (
  echo Demarrage du serveur de developpement...
  start "Serveur Boites PC" cmd /c "npm run dev"
) else (
  echo Serveur deja en cours sur le port 5173.
)

REM --- Attendre que le port reponde ---
echo Attente du serveur...
for /l %%i in (1,1,40) do (
  netstat -ano | findstr /c:":5173" | findstr /c:"LISTENING" >nul
  if not errorlevel 1 goto :pret
  timeout /t 1 /nobreak >nul
)
echo [ERREUR] Le serveur n'a pas demarre.
pause
exit /b 1

:pret
echo Serveur pret.
echo.

REM --- Trouver un navigateur base sur Chromium (fenetres positionnables) ---
set "NAV="
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) do (
  if exist %%P if not defined NAV set "NAV=%%~P"
)

if not defined NAV (
  echo Aucun navigateur Chromium trouve : ouverture dans le navigateur par defaut,
  echo les fenetres ne seront pas positionnees automatiquement.
  start "" http://localhost:5173
  timeout /t 2 /nobreak >nul
  start "" http://localhost:5173/calage.html
  goto :fin
)

REM --- Deux fenetres cote a cote. La largeur du telephone a gauche, l'outil a droite ---
start "" "!NAV!" --new-window --window-position=40,40 --window-size=640,940 "http://localhost:5173"
timeout /t 2 /nobreak >nul
start "" "!NAV!" --new-window --window-position=700,40 --window-size=560,940 "http://localhost:5173/calage.html"

:fin
echo.
echo ------------------------------------------
echo Les deux fenetres sont ouvertes.
echo Fermez cette console quand vous avez fini
echo (le serveur tourne dans sa propre fenetre).
echo ------------------------------------------
echo.
pause
