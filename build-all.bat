@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === AIStream 影视 · 一键构建 Windows .exe + 手机 .apk + TV .apk ===
echo.
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/

call npm run sync:assets || goto :err
call npx electron-builder --win --x64 || goto :err
python scripts\build-apk.py || goto :err

echo.
echo === 构建完成，产物如下 ===
dir /b dist-win\*.exe
dir /b dist\*.apk
echo.
echo iOS .ipa 需在 macOS + Xcode 上执行 ios\build-ipa.sh 生成（Windows 无法签名打包）。
goto :eof

:err
echo.
echo [ERROR] 构建失败，请检查上方日志。
exit /b 1
