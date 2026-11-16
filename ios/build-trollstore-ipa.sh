#!/usr/bin/env bash
# ==================================================================
# AIStream 影视 · Mac 本地一键构建巨魔 IPA
# ------------------------------------------------------------------
# 在有 Xcode 的 Mac 上跑这一条命令即可产出巨魔可装的 IPA：
#   GATEWAY_URL=http://fnos.jiulingkeji.asia:8890 bash ios/build-trollstore-ipa.sh
#
# 特点：不需要 Apple 开发者账号 / 证书 / 描述文件；用 ldid 伪签名。
# 产出：dist/ipa/AIStream-TrollStore.ipa
# ==================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: 本脚本只能在 macOS + Xcode 上运行。当前系统：$(uname -s)" >&2
  echo "       Windows 用户请改用 GitHub Actions（.github/workflows/build-trollstore-ipa.yml）。" >&2
  exit 1
fi
command -v xcodebuild >/dev/null || { echo "ERROR: 未找到 xcodebuild，请先安装 Xcode 并选择 Command Line Tools" >&2; exit 1; }

if ! command -v ldid >/dev/null; then
  echo "==> 安装 ldid（伪签名工具）"
  if command -v brew >/dev/null; then brew install ldid; else
    echo "ERROR: 未找到 brew，请先安装 Homebrew 后再运行" >&2; exit 1
  fi
fi

echo "==> 1/6 安装依赖（Capacitor 6，支持 iOS 13+ / Xcode 15+）"
npm install --no-audit --no-fund
npm install --no-audit --no-fund @capacitor/core@6 @capacitor/cli@6 @capacitor/ios@6

echo "==> 2/6 注入构建参数"
node scripts/prepare-trollstore-ipa.mjs

echo "==> 3/6 同步四端 Web 资源"
npm run sync:assets

echo "==> 4/6 生成 / 同步 Xcode 工程 + ATS 配置"
# ios/ 目录已存在（存放构建脚本）；cap add 见到 ios/ 会拒绝，先暂存脚本再重建
SCRIPT_TMP="$(mktemp -d)"
cp ios/*.sh ios/*.plist "$SCRIPT_TMP/" 2>/dev/null || true
rm -rf ios
npx cap add ios
cp "$SCRIPT_TMP/"*.sh "$SCRIPT_TMP/"*.plist ios/ 2>/dev/null || true
rm -rf "$SCRIPT_TMP"
npx cap sync ios
PLIST="ios/App/App/Info.plist"
/usr/libexec/PlistBuddy -c "Delete :NSAppTransportSecurity" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :NSAppTransportSecurity dict" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :NSAppTransportSecurity:NSAllowsArbitraryLoads bool true" "$PLIST"

echo "==> 5/6 pod install + 构建未签名 App"
( cd ios/App && pod install --repo-update )
xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath build/DerivedData \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" CODE_SIGN_STYLE=Manual \
  build

echo "==> 6/6 伪签名 + 打包 IPA"
bash ios/package-trollstore-ipa.sh

echo ""
echo "完成：$ROOT/dist/ipa/AIStream-TrollStore.ipa"
echo "用巨魔（TrollStore）打开该文件即可安装。"
