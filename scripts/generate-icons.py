"""
生成各端原生壳所需的占位应用图标（品牌字 + 播放三角，与 public/icon.svg 同一视觉）。
注意：这些是「占位图标」，需求方未提供正式应用图标/启动图/TV Banner 素材，
     已登记为待补充项 P-35，正式上架前必须替换。
运行：python3 scripts/generate-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


C1 = (143, 123, 255)
C2 = (180, 92, 255)
C3 = (240, 96, 192)
BG = (13, 17, 28)


def make_base(size):
    """圆角深色底 + 对角紫粉渐变"""
    img = Image.new("RGB", (size, size), BG)
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = max(0.0, min(1.0, (x + y) / (2.0 * size)))
            c = lerp(C1, C2, t * 2) if t < 0.5 else lerp(C2, C3, (t - 0.5) * 2)
            px[x, y] = c
    # 圆角遮罩
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.22), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def icon(size, banner=False):
    if banner:
        W, H = 320, 180
        im = Image.new("RGBA", (W, H), BG)
        d = ImageDraw.Draw(im)
        # 渐变背景
        for x in range(W):
            c = lerp(C1, C3, x / W)
            d.line((x, 0, x, H), fill=c + (255,))
        grad = im
        im = Image.new("RGBA", (W, H), (13, 17, 28, 255))
        im.alpha_composite(grad, (0, 0))
        d = ImageDraw.Draw(im)
        # 左侧播放三角
        r = 34
        cx, cy = 62, H // 2
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255, 235))
        d.polygon([(cx - 10, cy - 16), (cx + 16, cy), (cx - 10, cy + 16)], fill=BG)
        # 文字
        font = load_font(38, bold=True)
        small = load_font(16, bold=False)
        d.text((118, 58), "AIStream", font=font, fill=(255, 255, 255, 255))
        d.text((120, 106), "影视  ·  TV", font=small, fill=(235, 225, 255, 255))
        return im.convert("RGB")

    im = make_base(size)
    d = ImageDraw.Draw(im)
    s = size / 192.0
    # 播放三角（白）
    cx, cy = size * 0.56, size * 0.5
    tri = [(int(cx - 16 * s), int(cy - 30 * s)),
           (int(cx + 32 * s), int(cy)),
           (int(cx - 16 * s), int(cy + 30 * s))]
    d.polygon(tri, fill=(255, 255, 255, 240))
    # 左侧竖条（呼应品牌 A）
    d.rounded_rectangle((int(38 * s), int(56 * s), int(48 * s), int(136 * s)),
                        radius=int(5 * s), fill=(255, 255, 255, 230))
    return im.convert("RGBA")


def load_font(size, bold=True):
    candidates = [
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for p in candidates:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return ImageFont.load_default()


def main():
    # Electron / Windows ico（多尺寸）
    build = ROOT / "build"
    build.mkdir(exist_ok=True)
    ico = icon(256)
    ico.save(build / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("OK  build/icon.ico")

    # Android 启动图标（两个工程）
    densities = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for proj in ("android", "android-tv"):
        for dpi, sz in densities.items():
            d = ROOT / proj / "app/src/main/res" / f"mipmap-{dpi}"
            d.mkdir(parents=True, exist_ok=True)
            icon(sz).save(d / "ic_launcher.png")
        print(f"OK  {proj} launcher icons")

    # Android TV Banner（Leanback 必需，320x180）
    banner_dir = ROOT / "android-tv/app/src/main/res/drawable-xhdpi"
    banner_dir.mkdir(parents=True, exist_ok=True)
    icon(192, banner=True).save(banner_dir / "tv_banner.png")
    print("OK  android-tv tv_banner.png (320x180)")

    # PWA / iOS 通用 PNG
    (ROOT / "public").mkdir(exist_ok=True)
    icon(512).save(ROOT / "public/icon.png")
    print("OK  public/icon.png")


if __name__ == "__main__":
    main()
