#!/usr/bin/env bash
# ==================================================================
# AIStream 影视 · 伪签名 + 打包巨魔 IPA（在 macOS / GitHub Actions 运行）
# ------------------------------------------------------------------
# 前置：已用 xcodebuild（CODE_SIGNING_ALLOWED=NO）编译出 App.app，
#       且已 brew install ldid。全程不需要 Apple 开发者账号。
# 产出：dist/ipa/AIStream-TrollStore.ipa
# ==================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
DERIVED="${ROOT}/build/DerivedData/Build/Products/Release-iphoneos"
APP=$(find "$DERIVED" -maxdepth 2 -type d -name 'App.app' | head -n 1)

if [[ -z "$APP" ]]; then
  echo "ERROR: 未找到 App.app，请先执行 xcodebuild（CODE_SIGNING_ALLOWED=NO）" >&2
  find "$DERIVED" -maxdepth 3 -type d 2>/dev/null | head -20 >&2
  exit 1
fi
command -v ldid >/dev/null || { echo "ERROR: 未找到 ldid，请先 brew install ldid" >&2; exit 1; }

ENT="${ROOT}/ios/trollstore.entitlements.plist"
OUTDIR="${ROOT}/dist/ipa"
STAGE="${ROOT}/build/ipa-stage"

echo "==> App   : $APP"
echo "==> 签名  : ldid -S (fakesign, entitlements)"
echo "==>  entitlements:"
cat "$ENT"

rm -rf "$STAGE" "$OUTDIR"
mkdir -p "$STAGE/Payload" "$OUTDIR"
cp -R "$APP" "$STAGE/Payload/App.app"

# 对 App 内所有 Mach-O 可执行文件伪签名（主二进制 + 内嵌 Frameworks / dylibs）
ldid -S"$ENT" "$STAGE/Payload/App.app/App"
find "$STAGE/Payload/App.app" -type f \( -name '*.dylib' -o -path '*/Frameworks/*' \) -print0 2>/dev/null \
  | while IFS= read -r -d '' f; do
      if file "$f" | grep -q 'Mach-O'; then ldid -S"$ENT" "$f" || true; fi
    done

# 标准 IPA = zip 压缩的 Payload 目录
( cd "$STAGE" && zip -qry "$OUTDIR/AIStream-TrollStore.ipa" Payload )

echo "==> 完成："
ls -lh "$OUTDIR/AIStream-TrollStore.ipa"

# 校验结构：IPA 内必须存在 Payload/App.app/App
unzip -l "$OUTDIR/AIStream-TrollStore.ipa" | grep -q 'Payload/App.app/App' \
  || { echo "ERROR: IPA 结构校验失败" >&2; exit 1; }
echo "==> 结构校验通过（Payload/App.app/App 存在）"
