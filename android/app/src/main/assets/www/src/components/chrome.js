/** 四端共用外壳：平台切换器（验收用） + 全局 Toast + 内置播放器注册 */
import { bus, EVT } from '../core/events.js';
import { buildPlatformLink, PLATFORM_META } from '../core/platform.js';
import './player.js';

export function mountChrome(platform) {
  document.documentElement.dataset.platform = platform;
  const host = document.createElement('div');
  host.className = 'platform-switch';
  host.innerHTML = `<span class="platform-switch__label">验收</span>${Object.entries(PLATFORM_META)
    .map(([k, m]) => `<a href="${buildPlatformLink(k)}" class="${k === platform ? 'is-on' : ''}" title="${m.label}">${m.short}</a>`)
    .join('')}`;
  document.body.appendChild(host);

  const toastHost = document.createElement('div');
  toastHost.className = 'toast-host';
  document.body.appendChild(toastHost);

  let timer = null;
  bus.on(EVT.TOAST, (s) => {
    if (!s?.toast?.message) return;
    toastHost.innerHTML = `<div class="toast">${escape(s.toast.message)}</div>`;
    clearTimeout(timer);
    timer = setTimeout(() => { toastHost.innerHTML = ''; }, 2600);
  });
}

function escape(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
