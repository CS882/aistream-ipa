/**
 * 应用偏好设置（四端共用，localStorage 持久化）
 * 只存用户偏好，不存任何影视内容或账号凭据。
 */
import { bus } from './events.js';

const KEY = 'aistream_settings';

export const SETTING_SCHEMA = Object.freeze([
  { group: '播放', key: 'playMode', label: '播放模式', type: 'select', default: 'internal',
    options: [
      { value: 'internal', label: '内置播放器（推荐）' },
      { value: 'ask', label: '每次询问（显示剧集列表）' },
      { value: 'external', label: '外部播放器（自动打开）' },
      { value: 'copy', label: '仅复制播放地址' },
    ],
    hint: '内置播放器支持 m3u8 / mp4、选集与线路切换，TV 遥控可操作' },
  { group: '播放', key: 'quality', label: '清晰度偏好', type: 'select', default: 'auto',
    options: [
      { value: 'auto', label: '自动 / 跟随片源' },
      { value: 'hd', label: '高清优先' },
      { value: 'smooth', label: '流畅优先' },
    ],
    hint: '已接入 HLS；片源未提供多码率时由片源决定' },
  { group: '播放', key: 'gateway', label: '内容源网关（iOS 用）', type: 'text', default: '',
    placeholder: 'http://192.168.1.10:5173',
    hint: 'iOS 壳没有内嵌 Node 服务；填运行本项目的电脑 / NAS 地址（需 HOST=0.0.0.0 启动）。留空则用同源' },
  { group: '播放', key: 'streamProxy', label: '跨域片源走本机中转', type: 'toggle', default: true,
    hint: '第三方 m3u8 / mp4 不返回 CORS 头时，经本机 /api/proxy 转发（含分片与密钥重写）；关闭后仅直连' },
  { group: '播放', key: 'autoNext', label: '自动播放下一集', type: 'toggle', default: true,
    hint: '播放结束后自动切换到下一集' },
  { group: '播放', key: 'danmukuEnabled', label: '弹幕', type: 'toggle', default: true,
    hint: '内置 ArtPlayer 弹幕插件；站点未提供弹幕接口，只做本地发送，不加载虚构弹幕' },
  { group: '播放', key: 'skipIntro', label: '跳过片头（秒）', type: 'range', min: 0, max: 180, step: 5, default: 0,
    hint: '开始播放时自动跳过前 N 秒' },
  { group: '播放', key: 'skipOutro', label: '跳过片尾（秒）', type: 'range', min: 0, max: 180, step: 5, default: 0,
    hint: '距片尾 N 秒时切下一集' },
  { group: '界面', key: 'preloadPoster', label: '预加载海报', type: 'toggle', default: true,
    hint: '关闭后海报改为滚动到可见时才加载' },
  { group: '界面', key: 'showStats', label: '显示内容统计', type: 'toggle', default: true },
  { group: '界面', key: 'showQuickEntries', label: '显示快捷入口', type: 'toggle', default: true },
  { group: '搜索', key: 'rememberSearch', label: '保留搜索历史', type: 'toggle', default: true },
]);

const DEFAULTS = Object.fromEntries(SETTING_SCHEMA.map((i) => [i.key, i.default]));
let cache = null;

function read() {
  if (cache) return cache;
  let saved = {};
  try { saved = JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}') || {}; } catch { /* ignore */ }
  cache = { ...DEFAULTS, ...saved };
  return cache;
}

export function getSettings() { return { ...read() }; }
export function getSetting(key) { return read()[key]; }

export function setSetting(key, value) {
  const s = read();
  s[key] = value;
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  applyPreferences();
  bus.emit('settings', getSettings());
  return value;
}

export function resetSettings() {
  cache = { ...DEFAULTS };
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(cache)); } catch { /* ignore */ }
  applyPreferences();
  bus.emit('settings', getSettings());
}

/** 把偏好应用到 DOM（四端统一） */
export function applyPreferences() {
  if (typeof document === 'undefined') return;
  const s = read();
  document.documentElement.dataset.preload = s.preloadPoster ? 'eager' : 'lazy';
  document.documentElement.dataset.showStats = s.showStats ? '1' : '0';
  document.documentElement.dataset.showQuick = s.showQuickEntries ? '1' : '0';
}

/** 搜索历史（仅本地，不上传） */
const HISTORY_KEY = 'aistream_search_history';
export function getSearchHistory() {
  try { return JSON.parse(globalThis.localStorage?.getItem(HISTORY_KEY) || '[]') || []; } catch { return []; }
}
export function pushSearchHistory(q) {
  if (!getSetting('rememberSearch') || !q) return;
  const list = [q, ...getSearchHistory().filter((x) => x !== q)].slice(0, 8);
  try { globalThis.localStorage?.setItem(HISTORY_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  bus.emit('settings', getSettings());
}
export function clearSearchHistory() {
  try { globalThis.localStorage?.removeItem(HISTORY_KEY); } catch { /* ignore */ }
  bus.emit('settings', getSettings());
}
