# 巨魔（TrollStore）IPA 构建与网关部署

> 目标：产出一个可被巨魔直接安装、免 Apple 开发者签名的 iOS 包，装上后能连上 `fnos.jiulingkeji.asia:8890` 的真实内容。

## 一、先弄清两件事

1. **巨魔不需要 Apple 签名，但仍需要一个原生 Mach-O 程序。** IPA 不是网页压缩包，里面必须有一个用 Xcode 编译出来的 WebView 外壳可执行文件。Windows / Linux 没有 Xcode 与 iOS SDK，无法编译。因此构建必须发生在 macOS（本机 Mac 或 GitHub 云端 Mac）。
2. **内容源没有 CORS 头，iOS WebView 不能直连。** 实测 `fnos.jiulingkeji.asia:8890` 的响应不含 `Access-Control-Allow-Origin`，OPTIONS 预检返回 401。因此需要一个带 CORS 的代理网关，App 通过它访问内容源。

## 二、构建 IPA（二选一）

### 方式 A：GitHub Actions 云端构建（无需 Mac，推荐）

1. 把本项目推送到任意 GitHub 仓库（公开 / 私有均可）。
2. 打开仓库 **Actions** → **Build TrollStore IPA** → **Run workflow**。
3. 可选填写参数：
   - `gateway`：内置网关地址，默认 `http://fnos.jiulingkeji.asia:8891`
   - `bundle_id`：包名，默认 `com.aistream.player`
4. 运行结束后，在本次运行的 **Artifacts** 下载 `AIStream-TrollStore-IPA`，解压得到 `AIStream-TrollStore.ipa`。

工作流固定使用 Capacitor 6（支持 iOS 13+，Xcode 15+），用 `xcodebuild` 关闭签名编译，`ldid -S` 伪签名，不需要证书或描述文件。

### 方式 B：本地 Mac 一键构建

需要 macOS + Xcode + Homebrew。一条命令：

```bash
cd AIStream
GATEWAY_URL=http://fnos.jiulingkeji.asia:8891 bash ios/build-trollstore-ipa.sh
# 产出：dist/ipa/AIStream-TrollStore.ipa
```

脚本自动完成：装 Capacitor 6 → 注入参数 → 同步 Web 资源 → 生成 Xcode 工程 → 配置 ATS → pod install → 免签名编译 → ldid 伪签名 → 打包校验。

### 安装

把 IPA 传到手机，用巨魔（TrollStore）→ **Install TrollStore IPA / 打开方式选 TrollStore** 安装。巨魔支持的系统版本：iOS 14.0 beta 2 – 16.6.1、16.7 RC、17.0。

## 三、部署网关（决定装上后是否能看片）

内容源所在服务器（fnos）上再跑一份**本项目自带的零依赖代理** `server.js`，监听另一个端口 `8891`，把请求转发给本机的 8890 内容源并补上 CORS 头。

在本机（fnos 服务器）执行：

```bash
cd AIStream
HOST=0.0.0.0 PORT=8891 AISTREAM_HOST=127.0.0.1:8890 nohup node server.js > gateway.log 2>&1 &
```

验证（在任意能访问公网的机器）：

```bash
curl -i http://fnos.jiulingkeji.asia:8891/api/public
# 期望：HTTP 200，且响应头含 Access-Control-Allow-Origin: *
```

要点：

- **8891 需要从公网放行**：在 fnos 的路由器 / 防火墙 / 反代把 8891 映射到这台机器。本次实测 8891 尚未放行（连接失败），需你完成映射；否则 App 里改填其它可用网关地址即可。
- 若不方便开新端口，也可把网关填成任意一台运行了 `HOST=0.0.0.0 node server.js` 的电脑 / NAS 的局域网或公网地址。
- App 内可随时覆盖：设置 → 播放 → **内容源网关**。留空时（仅巨魔 IPA 构建版）自动使用构建时注入的内置网关。
- iOS 明文 HTTP 需要 ATS 例外；构建脚本已写入 `NSAllowsArbitraryLoads=true`。若改用 HTTPS 网关则无需例外。

## 四、相关文件

| 文件 | 作用 |
|------|------|
| `.github/workflows/build-trollstore-ipa.yml` | 云端构建工作流 |
| `ios/build-trollstore-ipa.sh` | 本地 Mac 一键构建 |
| `ios/package-trollstore-ipa.sh` | 伪签名 + 打包 IPA |
| `ios/trollstore.entitlements.plist` | 巨魔伪签名权限 |
| `scripts/prepare-trollstore-ipa.mjs` | 构建期注入 Bundle ID / Team ID / 网关 |
| `src/core/ios-config.js` | iOS 默认配置（可构建期覆盖） |

## 五、待确认项

- 8891 端口是否可由公网访问（当前探测为不通，需在 fnos 放行）。
- 你的设备 iOS 版本是否在巨魔支持范围（14.0 beta 2–16.6.1 / 16.7 RC / 17.0）。
- 若需自定义包名 / Team ID，在 Run workflow 或环境变量里传入即可。
