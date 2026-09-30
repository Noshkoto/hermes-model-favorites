@echo off
setlocal EnableExtensions
rem Install Model Favorites into the local Hermes Desktop plugin folder.
rem Double-click this file, or run it from the unzipped folder.

set "SRC=%~dp0desktop\plugin.js"
if defined HERMES_HOME (
  set "HERMES_DIR=%HERMES_HOME%"
) else (
  set "HERMES_DIR=%USERPROFILE%\.hermes"
)
set "DEST=%HERMES_DIR%\desktop-plugins\model-favorites"

if not exist "%SRC%" (
  echo.
  echo Could not find desktop\plugin.js next to this script.
  echo Unzip the whole folder first, then run install.cmd from inside it.
  echo.
  pause
  exit /b 1
)

if not exist "%DEST%" mkdir "%DEST%"
if errorlevel 1 (
  echo.
  echo Could not create %DEST%
  echo.
  pause
  exit /b 1
)

copy /Y "%SRC%" "%DEST%\plugin.js" >nul
if errorlevel 1 (
  echo.
  echo Copy failed.
  echo.
  pause
  exit /b 1
)

echo.
echo Installed Model Favorites
echo   %DEST%\plugin.js
echo.
echo Next, in Hermes Desktop:
echo   1. Press Ctrl+K
echo   2. Run "Reload desktop plugins"
echo   3. Open a chat and click the star in the composer
echo.
echo Close the favorites popover and open it again if it was already open.
echo.
pause
exit /b 0
