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
 * 内容源 fnos.jiulingkeji.asia:8890 无 CORS 头，iOS WebView 直连会被拦截；
 * iOS 原生壳又没有内嵌 Node 代理，因此在 fnos 服务器上另跑一份本项目的
 * server.js 监听 8891（AISTREAM_HOST=127.0.0.1:8890 PORT=8891），
 * 再把 8891 放行到公网，即可"装上即用"。
 * 构建时可用环境变量 GATEWAY_URL 覆盖。
 */
export const IOS_BUILTIN_GATEWAY = 'http://fnos.jiulingkeji.asia:8891';

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
