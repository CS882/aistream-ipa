#!/usr/bin/env bash
# ==================================================================
# AIStream 影视 · iOS .ipa 一键构建脚本
# ------------------------------------------------------------------
# 【平台限制】.ipa 必须在 macOS + Xcode 上构建：
#   codesign / xcodebuild / iOS SDK / 签名证书只有 macOS 提供，
#   Windows / Linux 无法产出可安装的 .ipa。本脚本请在 Mac 上执行。
#
# 前置：
#   - macOS + Xcode（Command Line Tools 已选）
#   - Apple Developer 账号（Team ID）
#   - Node 18+
#
# 用法：
#   APP_ID=com.yourcompany.aistream TEAM_ID=ABCDE12345 ./ios/build-ipa.sh
#
# 产出： dist/ipa/AIStream.ipa
# ==================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

: "${APP_ID:?请设置 APP_ID（iOS Bundle ID，待补充项 P-27）}"
: "${TEAM_ID:?请设置 TEAM_ID（Apple Developer Team ID）}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: .ipa 只能在 macOS + Xcode 上构建。当前系统：$(uname -s)" >&2
  echo "       本脚本需在 Mac 上执行；Windows 上只能准备工程，无法签名打包。" >&2
  exit 1
fi
command -v xcodebuild >/dev/null || { echo "ERROR: 未找到 xcodebuild，请先安装 Xcode"; exit 1; }

echo "==> 1/6 安装依赖"
npm install --no-audit --no-fund
npm install -D @capacitor/cli @capacitor/core
npm install @capacitor/ios

echo "==> 2/6 同步四端 Web 资源到 web/"
npm run sync:assets

echo "==> 3/6 写入 Bundle ID（需求方提供，不在此脚本内假设）"
node -e "
const fs=require('fs');
const p='capacitor.config.json';
const c=JSON.parse(fs.readFileSync(p,'utf8'));
c.appId=process.env.APP_ID;
fs.writeFileSync(p, JSON.stringify(c,null,2)+'\n');
console.log('  appId =', c.appId);
"

echo "==> 4/6 生成 / 同步 Xcode 工程"
if [[ ! -d ios/App ]]; then
  npx cap add ios
else
  npx cap sync ios
fi

echo "==> 5/6 生成 ExportOptions.plist"
mkdir -p build dist/ipa
sed "s/__TEAM_ID__/${TEAM_ID}/g" ios/ExportOptions.template.plist > ios/ExportOptions.plist

echo "==> 6/6 archive + export"
xcodebuild -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "${ROOT}/build/AIStream.xcarchive" \
  -allowProvisioningUpdates \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="${TEAM_ID}" \
  archive

xcodebuild -exportArchive \
  -archivePath "${ROOT}/build/AIStream.xcarchive" \
  -exportPath "${ROOT}/dist/ipa" \
  -exportOptionsPlist "${ROOT}/ios/ExportOptions.plist" \
  -allowProvisioningUpdates

if [[ -f dist/ipa/App.ipa ]]; then
  mv dist/ipa/App.ipa dist/ipa/AIStream.ipa
fi
echo "==> 完成： dist/ipa/AIStream.ipa"
ls -lh dist/ipa/
