#!/usr/bin/env python3
"""
零 Gradle / 零 Maven 依赖的 APK 构建器
==================================================================
直接使用本机 Android SDK 自带的 aapt2 / javac / d8 / zipalign / apksigner，
不下载 Gradle Wrapper、不解析任何第三方依赖，因此在本机可离线、可重复地产出 APK。

用法：
    python scripts/build-apk.py            # 构建手机版 + TV 版
    python scripts/build-apk.py android    # 只构建手机版
    python scripts/build-apk.py android-tv # 只构建 TV 版

产出：
    dist/AIStream-Mobile-1.0.0.apk
    dist/AIStream-TV-1.0.0.apk
（使用 ~/.android/debug.keystore 签名，可直接 adb install；正式上架需换成需求方签名。）
"""
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SDK = Path(
    os.environ.get("ANDROID_HOME")
    or os.environ.get("ANDROID_SDK_ROOT")
    or (Path.home() / "AppData/Local/Android/Sdk")
)
BT = SDK / "build-tools" / "34.0.0"
PLATFORM_JAR = SDK / "platforms" / "android-34" / "android.jar"
DEBUG_KS = Path.home() / ".android" / "debug.keystore"
DIST = ROOT / "dist"

AAPT2 = BT / "aapt2.exe"
D8 = BT / "d8.bat"
ZIPALIGN = BT / "zipalign.exe"
APKSIGNER = BT / "apksigner.bat"

PROJECTS = {
    "android": {"pkg": "com.aistream.pending.mobile", "out": "AIStream-Mobile-1.0.0.apk"},
    "android-tv": {"pkg": "com.aistream.pending.tv", "out": "AIStream-TV-1.0.0.apk"},
}


def run(cmd, label):
    shown = " ".join(str(x) for x in cmd[:5])
    print(f"  [{label}] {shown} ...")
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True, errors="replace")
    if r.returncode != 0:
        print((r.stdout or "")[-2500:])
        print((r.stderr or "")[-3500:])
        raise SystemExit(f"[FAIL] {label} 失败，退出码 {r.returncode}")
    return r


def as_bat(tool, args):
    """Windows 下 .bat 需要经 cmd /c 调用"""
    return ["cmd", "/c", str(tool)] + [str(a) for a in args]


def preflight():
    missing = []
    for p in (BT, PLATFORM_JAR, AAPT2, D8, ZIPALIGN, APKSIGNER, DEBUG_KS):
        if not p.exists():
            missing.append(str(p))
    if missing:
        raise SystemExit("缺少构建工具：\n  " + "\n  ".join(missing)
                         + "\n请设置 ANDROID_HOME，并确认已安装 build-tools;34.0.0 / platforms;android-34。")


def build(name, cfg):
    print(f"\n=== 构建 {name} -> {cfg['out']} ===")
    proj = ROOT / name
    main = proj / "app/src/main"
    work = proj / "build/manual"
    if work.exists():
        shutil.rmtree(work)
    for sub in ("gen", "classes", "dex"):
        (work / sub).mkdir(parents=True, exist_ok=True)

    res = main / "res"
    manifest = main / "AndroidManifest.xml"
    assets = main / "assets"
    java_src = main / "java"

    if not (assets / "www/index.html").exists():
        raise SystemExit(f"缺少 Web 资源：{assets}/www （请先运行 npm run sync:assets）")

    # 1) 编译资源为 .flat 集合
    run([AAPT2, "compile", "--dir", str(res), "-o", str(work / "compiled.zip")], "aapt2 compile")

    # 2) 链接生成基础 APK + R.java，并把 assets/www 打进包
    run([AAPT2, "link", "-o", str(work / "base.apk"),
         "-I", str(PLATFORM_JAR),
         "--manifest", str(manifest),
         "-R", str(work / "compiled.zip"),
         "-A", str(assets),
         "--java", str(work / "gen"),
         "--auto-add-overlay",
         "--min-sdk-version", "23",
         "--target-sdk-version", "34",
         "--version-code", "1",
         "--version-name", "1.0.0"], "aapt2.link")

    # 3) 编译 Java（零第三方依赖，仅需 android.jar）
    srcs = [str(p) for p in java_src.rglob("*.java")]
    srcs += [str(p) for p in (work / "gen").rglob("R.java")]
    if not srcs:
        raise SystemExit("未找到 Java 源文件")
    run(["javac", "-encoding", "UTF-8", "-source", "8", "-target", "8",
         "-classpath", str(PLATFORM_JAR), "-d", str(work / "classes")] + srcs, "javac")

    # 4) class -> dex
    classes = [str(p) for p in (work / "classes").rglob("*.class")]
    run(as_bat(D8, ["--lib", str(PLATFORM_JAR), "--min-api", "23",
                    "--output", str(work / "dex")] + classes), "d8")

    # 5) 把 classes.dex 写入 APK
    dex = work / "dex" / "classes.dex"
    if not dex.exists():
        raise SystemExit("d8 未生成 classes.dex")
    with zipfile.ZipFile(work / "base.apk", "a", zipfile.ZIP_DEFLATED) as z:
        z.write(dex, "classes.dex")

    # 6) 对齐 + 7) 签名
    run([ZIPALIGN, "-f", "4", str(work / "base.apk"), str(work / "aligned.apk")], "zipalign")
    DIST.mkdir(exist_ok=True)
    out = DIST / cfg["out"]
    if out.exists():
        out.unlink()
    run(as_bat(APKSIGNER, ["sign", "--ks", str(DEBUG_KS),
                           "--ks-pass", "pass:android",
                           "--key-pass", "pass:android",
                           "--out", str(out),
                           str(work / "aligned.apk")]), "apksigner")

    # 8) 校验签名与包内关键文件
    run(as_bat(APKSIGNER, ["verify", "--verbose", str(out)]), "apksigner verify")
    with zipfile.ZipFile(out) as z:
        names = set(z.namelist())
        needed = ["classes.dex", "AndroidManifest.xml", "assets/www/index.html"]
        for n in needed:
            if n not in names:
                raise SystemExit(f"APK 缺少 {n}")
        web = [n for n in names if n.startswith("assets/www/")]
        print(f"  OK  包内 Web 资源 {len(web)} 个，classes.dex {z.getinfo('classes.dex').file_size} bytes")
    print(f"  DONE  {out}  ({out.stat().st_size / 1024 / 1024:.2f} MB)")


def main():
    args = [a for a in sys.argv[1:] if a in PROJECTS] or list(PROJECTS)
    preflight()
    print(f"  SDK: {SDK}")
    print(f"  android.jar: {PLATFORM_JAR}")
    for name in args:
        build(name, PROJECTS[name])
    print("\n全部完成。安装示例： adb install -r dist/AIStream-Mobile-1.0.0.apk")


if __name__ == "__main__":
    main()
