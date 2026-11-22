#!/usr/bin/env bash
# AIStream 原生 iOS · Mac 一键出包（巨魔可直装）
# 用法：bash ios-native/build.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
cd ios-native

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: iOS 只能在 macOS + Xcode 上编译。当前：$(uname -s)" >&2
  echo "       Windows 请用 GitHub Actions（.github/workflows/ios-native.yml）。" >&2
  exit 1
fi

command -v xcodebuild >/dev/null || { echo "ERROR: 需要 Xcode（xcodebuild）" >&2; exit 1; }
command -v xcodegen  >/dev/null || { echo "==> brew install xcodegen"; brew install xcodegen; }
command -v ldid      >/dev/null || { echo "==> brew install ldid"; brew install ldid; }

echo "==> 1/4 生成 Xcode 工程"
xcodegen generate

echo "==> 2/4 编译（未签名）"
xcodebuild \
  -project AIStream.xcodeproj -scheme AIStream \
  -sdk iphoneos -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath build/DerivedData \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" CODE_SIGN_STYLE=Manual \
  build

APP="build/DerivedData/Build/Products/Release-iphoneos/AIStream.app"
[[ -d "$APP" ]] || { echo "ERROR: 没找到 $APP" >&2; exit 1; }

echo "==> 3/4 ldid 伪签名"
ldid -S trollstore.entitlements.plist "$APP/AIStream"

echo "==> 4/4 打包 IPA"
STAGE="$ROOT/build/ipa-native"
OUT="$ROOT/dist/ipa"
rm -rf "$STAGE" && mkdir -p "$STAGE/Payload" "$OUT"
cp -R "$APP" "$STAGE/Payload/"
( cd "$STAGE" && zip -qry "$OUT/AIStream-Native-TrollStore.ipa" Payload )

echo ""
echo "完成：$OUT/AIStream-Native-TrollStore.ipa"
ls -lh "$OUT/AIStream-Native-TrollStore.ipa"
echo "用巨魔（TrollStore）打开该文件即可安装。"
