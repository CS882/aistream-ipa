/**
 * iOS 构建期配置
 * ==================================================================
 * 由 GitHub Actions（.github/workflows/build-trollstore-ipa.yml）或
 * Mac 本地脚本（ios/build-trollstore-ipa.sh）在打包前注入真实值。
 * 这里是默认约定值，巨魔（TrollStore）不校验 Bundle ID / Team ID，
 * 因此默认值即可正常安装；如需区分应用可自行修改。
 *
 * 注意：本文件不包含任何片名 / 海报 / 集数 / 评分 / 播放链接等示例数据。
 * ==================================================================
 */

/** 苹果包名（巨魔侧载无需在 Apple 注册，唯一即可） */
export const IOS_BUNDLE_ID = 'com.aistream.player';

/** 伪签名用的 Team ID（巨魔不校验真实性，任意 10 位均可） */
export const IOS_TEAM_ID = 'AAAAAAAAAA';

/**
 * 内置内容源网关。
 * 直连公网可达的 8890；CORS 由 CapacitorHttp 原生 HTTP 插件解决
 * （capacitor.config.json 已开启 plugins.CapacitorHttp.enabled=true，
 *  WebView 的 fetch 会被 patch 成走原生层，不受 WebView CORS 限制）。
 * 因此无需在服务器另跑代理或放行额外端口，装上即用。
 * 构建时可用环境变量 GATEWAY_URL 覆盖为自建网关。
 */
export const IOS_BUILTIN_GATEWAY = 'http://fnos.jiulingkeji.asia:8890';

/**
 * 是否为 iOS 原生（Capacitor）运行环境。
 * 仅在此环境启用内置网关；桌面浏览器 / 安卓走各自的同源内嵌代理，行为不变。
 */
export function isIOSRuntime() {
  const cap = globalThis.Capacitor;
  const isNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  if (!isNative) return false;
  const ua = globalThis.navigator?.userAgent || '';
  const proto = globalThis.location?.protocol || '';
  return /iPhone|iPad|iPod/i.test(ua) || /capacitor:/i.test(proto);
}
