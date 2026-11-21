/** 轻量事件总线：四端共享，用于 store → 视图 的解耦通知 */
class Bus {
  constructor() {
    this.map = new Map();
  }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) {
    this.map.get(type)?.delete(fn);
  }
  emit(type, payload) {
    this.map.get(type)?.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error('[AIStream] listener error', type, e); }
    });
    this.map.get('*')?.forEach((fn) => {
      try { fn({ type, payload }); } catch (e) { console.error(e); }
    });
  }
}

export const bus = new Bus();
export const EVT = Object.freeze({
  STATE: 'state',
  DETAIL: 'detail',
  PLAY: 'play',
  PLAY_PENDING: 'play-pending',   // 点击卡片即刻通知：先挂载播放器显示加载态，消除等待感
  TOAST: 'toast',
});
