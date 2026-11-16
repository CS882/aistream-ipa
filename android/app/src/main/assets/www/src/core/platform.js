/**
 * 平台探测：决定加载哪一套「独立布局模块」。
 * 注意：这里只做分流，不做缩放。三端各自拥有完整独立的 DOM 结构与 CSS。
 */

export const PLATFORM_META = Object.freeze({
  desktop: { label: '电脑桌面端', input: '键盘 + 鼠标', short: 'DESKTOP' },
  mobile: { label: 'iOS / 安卓移动端', input: '触摸', short: 'MOBILE' },
  tv: { label: 'TV 大屏端', input: '遥控器', short: 'TV' },
});

const TV_UA = /SmartTV|Smart TV|Android TV|AppleTV|Apple TV|GoogleTV|Google TV|BRAVIA|Roku|FireTV|Fire TV|HbbTV|NetCast|Tizen|Web0S|WebOS|MiTV|LetvTV|OTT|TV Box/i;
const IOS_UA = /iPad|iPhone|iPod/i;
const ANDROID_UA = /Android/i;
const MOBILE_UA = /Mobile|Tablet|Windows Phone/i;

/** 返回 'desktop' | 'mobile' | 'tv' */
export function detectPlatform(search = globalThis.location?.search ?? '') {
  const forced = new URLSearchParams(search).get('platform');
  if (forced && PLATFORM_META[forced]) return forced;

  const ua = globalThis.navigator?.userAgent || '';
  if (TV_UA.test(ua)) return 'tv';
  // 大屏 + 触摸缺失 + 无移动 UA 时，若显式声明为 TV 也在 UA 分支覆盖
  if (IOS_UA.test(ua) || ANDROID_UA.test(ua) || MOBILE_UA.test(ua)) return 'mobile';
  return 'desktop';
}

/** 移动端子设备识别，仅用于安全区/状态栏等细节，不改变布局模块 */
export function mobileFlavor() {
  const ua = globalThis.navigator?.userAgent || '';
  if (IOS_UA.test(ua)) return 'ios';
  if (ANDROID_UA.test(ua)) return 'android';
  return 'mobile-web';
}

/** 平台能力表：各端布局模块据此启用/禁用交互 */
export function capabilities(platform) {
  return {
    desktop: {
      hover: true, pointerFine: true, touch: false, remote: false,
      keyboardShortcuts: true, focusRing: false, safeArea: false, overscan: false,
      scrollMode: 'wheel-scrollbar', detailMode: 'drawer',
    },
    mobile: {
      hover: false, pointerFine: false, touch: true, remote: false,
      keyboardShortcuts: false, focusRing: false, safeArea: true, overscan: false,
      scrollMode: 'touch-swipe', detailMode: 'fullpage-push',
    },
    tv: {
      hover: false, pointerFine: false, touch: false, remote: true,
      keyboardShortcuts: false, focusRing: true, safeArea: true, overscan: true,
      scrollMode: 'focus-driven-rows', detailMode: 'immersive-fullscreen',
    },
  }[platform] || {};
}

/** 强制预览：在任意端用 ?platform=xxx 切换，便于验收四端一致性 */
export function buildPlatformLink(platform) {
  // 必须同时切换到对应端的 HTML 入口：各端入口各自加载独立的布局模块，
  // 只改 ?platform= 参数并不会改变已经加载的界面。
  const url = new URL(`${platform}.html`, globalThis.location.href);
  url.searchParams.set('platform', platform);
  return url.toString();
}
