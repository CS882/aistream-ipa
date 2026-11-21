# AIStream 原生 iOS（SwiftUI）

和 Android 原生版同构的 iOS 实现 —— **SwiftUI 重写，不是 Web 套壳**。

界面按同一套 tvOS 语言做：顶部标签导航、通栏 Hero、横向卡片行、6 列网格、玻璃胶囊筛选。
配色、字号、圆角、卡片尺寸都对齐 Android 版（bg `#05060A`、卡片 `#15151C`、紫 `#8B6CFF`、海报 `118×171` 圆角 12）。

站点地址内置 `fnos.jiulingkeji.asia:8890`，登录页只有账号密码 + 记住密码。

---

## 为什么要 Mac

iOS 的 `.app` 是 arm64 Mach-O 二进制，**只能用 Xcode 的 xcodebuild 编译**。
Windows 上没有 Xcode，Linux 也没有 —— 这是苹果的工具链限制，绕不过去。

所以两条路：

1. **有 Mac**：按下面三步，3 分钟出包
2. **没 Mac**：用 GitHub Actions 的 macOS runner（`.github/workflows/ios-native.yml` 已配好）

> ⚠️ 注意：**私有仓库的 macOS runner 要计费**（GitHub 免费额度只覆盖 Linux）。
> 私有仓库跑 macOS 任务会被直接取消（不分配机器）。要么把仓库改成 public，要么绑卡付费。

---

## 在 Mac 上一键出包

```bash
brew install xcodegen ldid
bash ios-native/build.sh
# 产物：dist/ipa/AIStream-Native-TrollStore.ipa
```

`build.sh` 做的事：xcodegen 生成工程 → xcodebuild 未签名编译 → ldid 伪签名 → 打 Payload → zip 成 IPA。

装法：TrollStore（巨魔）直接点开安装；没有巨魔就用 Sideloadly / AltStore 自签。

---

## 手动步骤

```bash
cd ios-native
xcodegen generate

xcodebuild \
  -project AIStream.xcodeproj -scheme AIStream \
  -sdk iphoneos -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath build/DerivedData \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" CODE_SIGN_STYLE=Manual \
  build

APP=build/DerivedData/Build/Products/Release-iphoneos/AIStream.app
ldid -S trollstore.entitlements.plist "$APP/AIStream"

mkdir -p /tmp/Payload && cp -R "$APP" /tmp/Payload/
cd /tmp && zip -qry AIStream-Native-TrollStore.ipa Payload
```

---

## 目录

```
ios-native/
├── project.yml                    XcodeGen 工程描述
├── trollstore.entitlements.plist  伪签名用
├── build.sh                       一键构建脚本
└── AIStream/
    ├── AIStreamApp.swift          入口 + 顶部标签导航 + 我的
    ├── Theme.swift                配色 / 玻璃胶囊 / 筛选 chip
    ├── Core.swift                 数据模型 + 接口 + 本地存储
    ├── LoginView.swift            登录页
    ├── HomeView.swift             Hero 轮播 + 栏目行 + 海报卡
    ├── CatalogView.swift          分类 + 类型/年份/国家/类别/排序
    └── DetailView.swift           详情 + 线路聚合 + 选集 + AVPlayer 播放
```

## 已知边界（与 Android 版一致）

- 站点 `api/up/catalog` 只认 `kind/limit/page`，`year/area/type/sort` 参数被服务端忽略
  → 分类页的筛选是对**已加载内容**做本地匹配
- 国家 / 细分类型只在详情接口的 `detail.{type,area}` 里 → CatalogView 会并发补前 80 条
- 库内总量：电影 310 / 电视剧 208 / 动漫 20 / 综艺 52，全是 2026–2025
- 播放只支持直链 m3u8；需要网页解析的线路 iOS 版暂不支持
