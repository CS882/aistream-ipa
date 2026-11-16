/**
 * AIStream 影视 · 影视数据源适配层（唯一数据出入口）
 * ==================================================================
 * 需求方硬性约束：
 *   1) 影视数据仅对接需求方指定的内容源；
 *   2) 内容地址、数据字段及必要访问参数以需求方提供的信息为准；
 *   3) 不得自行假设、编造或用示例值填充；
 *   4) 本次未提供的信息统一作为「待补充项」集中列出。
 *
 * 本次需求方【已提供】的全部信息：
 *   host = "fnos.jiulingkeji.asia:8890"
 *
 * 协议、接口路径、请求方法、参数名、鉴权、字段映射、播放地址规则等均【未提供】，
 * 因此一律保持 null，不做任何推测。特别注意：
 *   · 不假定 http / https；
 *   · 不把内部语义名（nav/channel/keyword/page/id）直接当作内容源参数名发出，
 *     必须由需求方在 paramMap 中给出真实参数名，未给出的参数直接不发送；
 *   · 不假定响应一定是数组，详情 / 播放按单对象解析。
 * 本文件与全项目均不包含片名 / 海报 / 集数 / 评分 / 播放链接等示例值。
 * ==================================================================
 */

/** 需求方唯一明确提供的内容源地址 */
export const PROVIDED_HOST = 'fnos.jiulingkeji.asia:8890';

/**
 * 数据源配置。除 host 外全部为「待补充项」。
 * 填写规则见 docs/02-数据源对接指南.md；填完即可生效，无需改动 UI 与业务逻辑。
 * 跨域（P-03）属于部署层/原生壳层事项，不是前端请求参数，故不在此配置。
 */
export const DATA_SOURCE = {
  host: PROVIDED_HOST,

  // ── 待补充：传输与根路径 ────────────────────────────────
  protocol: null,        // 'http' | 'https'（未提供，禁止假定）
  apiBasePath: null,     // 接口根路径（未提供，禁止假定）

  // ── 待补充：各业务接口 ──────────────────────────────────
  // 可填相对路径，或需求方给出的完整地址；两者都由需求方提供，不自行拼造。
  endpoints: {
    channels: null,      // 分类 / 频道列表
    list: null,          // 首页 / 分类 / 榜单 列表
    search: null,        // 搜索
    detail: null,        // 详情
    play: null,          // 播放入口地址
  },

  // ── 待补充：调用约定 ────────────────────────────────────
  method: null,          // 'GET' | 'POST'（未提供）
  auth: null,            // token / cookie / 签名 / 无（未提供）
  staticParams: null,    // 接口要求的固定参数「名 → 值」（未提供，禁止编造参数名）
  headers: null,         // 必要请求头（未提供）
  pagination: null,      // { pageKey, sizeKey, startPage, totalKey, listKey, dataKey }（未提供）

  /**
   * 待补充：内部语义参数 → 内容源真实参数名。
   * 未给出真实参数名的语义参数一律【不发送】，绝不把 nav/keyword/id 等内部名直接发出去。
   * 结构示例（键名为内部语义，值须由需求方给出；此处全部保持 null）：
   *   list:    { nav: null, channel: null, keyword: null, page: null }
   *   search:  { keyword: null }
   *   detail:  { id: null }
   *   play:    { id: null }
   *   channels: {}
   */
  paramMap: null,

  // ── 待补充：统一内容模型 → 内容源字段 的映射 ────────────
  // 值必须填「内容源真实字段名」，未确认前保持 null。
  fieldMap: {
    id: null,
    title: null,
    poster: null,
    badge: null,         // 参考图右上角「高清」角标对应字段
    subtitle: null,      // 参考图更新文案对应字段
    score: null,         // 参考图评分对应字段
    category: null,
    description: null,
    playUrl: null,
    episodes: null,
  },

  // 严禁示例数据：此开关恒为 false，且代码中不存在任何 mock 数据分支
  allowMockData: false,
};

/**
 * 「待补充项」集中登记表。
 * 每一项同时被：① 界面上的未配置状态条 ② docs/00-待补充项清单.md 引用，
 * 保证代码与文档不脱节。
 */
export const PENDING_ITEMS = Object.freeze([
  { group: '连接', key: 'protocol', label: '访问协议', detail: 'http 还是 https', impact: '决定了能否发起请求与是否被混合内容拦截' },
  { group: '连接', key: 'apiBasePath', label: '接口根路径', detail: '内容源对外提供数据的路径前缀', impact: '无此值无法拼出任何请求 URL' },
  { group: '连接', key: 'deploy.corsProxy', label: '跨域策略（部署层）', detail: '浏览器/WebView 直连是否允许跨域；若不允许，需给出部署层或原生壳的代理方案，非前端配置项', impact: '桌面 Web / 移动 WebView / TV 浏览器直连可能失败' },
  { group: '接口', key: 'endpoints.channels', label: '分类接口', detail: '获取频道/分类列表的接口', impact: '顶部频道目前仅为 UI 版式，无法替换为真实分类' },
  { group: '接口', key: 'endpoints.list', label: '列表接口', detail: '首页、分类、榜单的列表接口', impact: '浏览功能无法返回真实条目' },
  { group: '接口', key: 'endpoints.search', label: '搜索接口', detail: '搜索接口及关键词参数名', impact: '搜索功能无法返回真实结果' },
  { group: '接口', key: 'endpoints.detail', label: '详情接口', detail: '详情接口及条目 id 参数名', impact: '详情功能无法返回真实内容' },
  { group: '接口', key: 'endpoints.play', label: '播放入口接口', detail: '获取播放地址的接口', impact: '播放入口无法解析真实地址' },
  { group: '调用', key: 'method', label: '请求方法', detail: 'GET / POST', impact: '请求构造方式未定' },
  { group: '调用', key: 'auth', label: '鉴权方式', detail: '是否需要 token / cookie / 签名，及其获取方式', impact: '无鉴权信息可能 401/403' },
  { group: '调用', key: 'staticParams', label: '必要访问参数', detail: '接口要求的固定参数名与取值；以及 paramMap 中各语义参数（nav/channel/keyword/page/id）对应的真实参数名', impact: '参数名未确认时相关参数一律不发送，接口可能返回空或报错' },
  { group: '调用', key: 'headers', label: '必要请求头', detail: '如 Referer / UA / 自定义头；POST 的 Content-Type 也可在此覆盖', impact: '部分内容源有防盗链校验' },
  { group: '调用', key: 'pagination', label: '分页与响应字段', detail: '页码/每页条数/起始页/总页数字段名；响应列表字段名 listKey、详情包壳字段名 dataKey', impact: '无法做加载更多，列表与详情响应无法解析' },
  { group: '调用', key: 'paramMap', label: '参数名映射', detail: '按 list/search/detail/play/channels 给出内部语义参数对应的真实参数名；未给出的参数不发送', impact: '不填则请求不带任何业务参数，能力判定为未就绪' },
  { group: '字段', key: 'fieldMap.id', label: '条目唯一标识字段', detail: '统一模型 id 对应的源字段', impact: '无法定位详情与播放' },
  { group: '字段', key: 'fieldMap.title', label: '片名字段', detail: '统一模型 title 对应的源字段', impact: '卡片标题无法渲染' },
  { group: '字段', key: 'fieldMap.poster', label: '海报字段', detail: '统一模型 poster 对应的源字段', impact: '海报无法渲染' },
  { group: '字段', key: 'fieldMap.badge', label: '清晰度角标字段', detail: '参考图右上角角标对应的源字段', impact: '角标无法渲染' },
  { group: '字段', key: 'fieldMap.subtitle', label: '更新文案字段', detail: '参考图更新文案对应的源字段', impact: '卡片副文案无法渲染' },
  { group: '字段', key: 'fieldMap.score', label: '评分字段', detail: '参考图评分对应的源字段', impact: '评分无法渲染' },
  { group: '字段', key: 'fieldMap.category', label: '分类字段', detail: '统一模型 category 对应的源字段', impact: '筛选功能无法按真实分类工作' },
  { group: '字段', key: 'fieldMap.description', label: '简介字段', detail: '统一模型 description 对应的源字段', impact: '详情页简介无法渲染' },
  { group: '字段', key: 'fieldMap.playUrl', label: '播放地址字段', detail: '统一模型 playUrl 对应的源字段', impact: '播放入口取不到地址' },
  { group: '字段', key: 'fieldMap.episodes', label: '剧集列表字段', detail: '统一模型 episodes 对应的源字段', impact: '选集无法渲染' },
  { group: '版式', key: 'ui.firstChannelLabel', label: '参考图首个频道名称', detail: '截图最左侧频道文字被裁切，当前以「推荐」作为默认选中标签', impact: '若需严格还原，需给出该频道真实名称' },
  { group: '版式', key: 'ui.hotSectionLabel', label: '分区标题文案', detail: '参考图分区标题被裁切，当前使用中性标题「热播榜单」', impact: '若需严格还原，需给出各分区真实标题与排序规则' },
  { group: '发布', key: 'app.desktopAppId', label: '桌面应用标识', detail: '应用名 / 包名 / 签名信息', impact: 'Electron 打包分发所需' },
  { group: '发布', key: 'app.iosBundleId', label: 'iOS Bundle ID', detail: '未在需求中给出', impact: 'Xcode 归档与上架所需' },
  { group: '发布', key: 'app.androidPackage', label: '安卓包名', detail: '未在需求中给出', impact: 'Gradle 构建与上架所需' },
  { group: '发布', key: 'app.tvRemoteMap', label: 'TV 遥控器按键映射', detail: '目标设备的 OK / Back / 菜单键 keyCode', impact: '不同厂商遥控器键值可能不同，需实机核对' },
  { group: '内容规则', key: 'content.responseEnvelope', label: '响应包结构', detail: '返回是数组还是对象包壳、状态/错误码字段；列表字段名填 pagination.listKey，详情包壳填 pagination.dataKey', impact: '响应解析规则未定，无法稳定取列表' },
  { group: '内容规则', key: 'content.posterReferer', label: '海报图访问规则', detail: '图片域名、是否需要 Referer / 防盗链 / 签名', impact: '海报可能加载失败' },
  { group: '内容规则', key: 'content.playUrlRule', label: '播放地址规则', detail: '直链还是需签名、是否有时效、是否需要代理转发', impact: '播放入口拿到的地址可能不可用' },
  { group: '内容规则', key: 'content.categoryEnum', label: '真实分类枚举', detail: '内容源实际支持的分类 id 与显示名', impact: '顶部频道无法对应真实分类' },
  { group: '发布', key: 'release.minOsVersions', label: '各端最低系统版本', detail: '桌面 / iOS / Android / Android TV 的最低版本', impact: '兼容性测试范围无法确定' },
  { group: '发布', key: 'release.storeAssets', label: '应用图标与商店素材', detail: '各端图标、启动图、截图、应用描述；当前原生壳使用占位图标', impact: '无法打包上架' },
  { group: '发布', key: 'release.iosTeamId', label: 'Apple Developer Team ID', detail: 'Xcode 自动签名与导出 .ipa 所需', impact: '无法在 Mac 上产出 .ipa' },
  { group: '发布', key: 'release.iosSigning', label: 'iOS 证书与描述文件', detail: 'Development / Distribution 证书、Provisioning Profile、导出方式', impact: '.ipa 无法真机安装或上架' },
  { group: '发布', key: 'release.androidSigning', label: '安卓正式签名密钥', detail: '当前两个 APK 使用 debug.keystore 签名，仅可测试安装', impact: '无法上架应用市场，也无法做版本升级' },
  { group: '发布', key: 'release.winSigning', label: 'Windows 代码签名证书', detail: 'EV / OV 代码签名证书', impact: '未签名 .exe 首次运行会出现 SmartScreen 提示' },
]);

const PENDING_BY_KEY = new Map(PENDING_ITEMS.map((i) => [i.key, i]));
const CAPABILITIES = ['channels', 'list', 'search', 'detail', 'play'];

/** 读取嵌套配置项，如 get('endpoints.list') */
export function get(path) {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), DATA_SOURCE);
}

/** 写入嵌套配置项（供对接时填充，仅改配置不改业务代码） */
export function set(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((acc, k) => acc[k], DATA_SOURCE);
  target[last] = value;
  return value;
}

/** 当前仍未补充的项（含发布/版式类人工确认项） */
export function pendingItems() {
  return PENDING_ITEMS.filter((item) => {
    // 非 DATA_SOURCE 顶层配置（部署 / 版式 / 内容规则 / 发布素材类）一律视为需人工确认
    if (!(item.key.split('.')[0] in DATA_SOURCE)) return true;
    return get(item.key) == null || get(item.key) === '';
  });
}

/** 拼装根地址；协议或路径未补充时返回 null（绝不自行猜 http/https） */
export function baseURL() {
  if (!DATA_SOURCE.protocol || DATA_SOURCE.apiBasePath == null) return null;
  const p = String(DATA_SOURCE.apiBasePath).replace(/^\/+/, '');
  return `${DATA_SOURCE.protocol}://${DATA_SOURCE.host}${p ? '/' + p : ''}`;
}

/** 针对某个业务能力的就绪检查 */
function readiness(capability) {
  const missing = [];
  const need = (key) => {
    if (get(key) == null || get(key) === '') missing.push(PENDING_BY_KEY.get(key) || { key, label: key });
  };
  need('protocol');
  need('apiBasePath');
  need('method');
  need(`endpoints.${capability}`);
  need('paramMap');           // 参数名映射未确认前不发起任何请求
  for (const f of ['id', 'title', 'poster']) need(`fieldMap.${f}`);
  if (capability === 'play') need('fieldMap.playUrl');
  return { ready: missing.length === 0, pending: missing };
}

function unconfigured(capability, pending) {
  return {
    ok: false,
    status: 'unconfigured',
    capability,
    data: [],
    pending,
    notice: '内容源尚未完成对接，以下信息待补充，界面不填充任何示例数据。',
  };
}

/**
 * 将内容源原始对象映射为统一内容模型。
 * 只按需求方确认的 fieldMap 取值；字段未确认时对应值为 null，不猜字段名、不设默认值文案。
 */
export function mapItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const fm = DATA_SOURCE.fieldMap;
  const pick = (k) => (fm[k] ? raw[fm[k]] ?? null : null);
  return {
    id: pick('id'),
    title: pick('title'),
    poster: pick('poster'),
    badge: pick('badge'),
    subtitle: pick('subtitle'),
    score: pick('score'),
    category: pick('category'),
    description: pick('description'),
    playUrl: pick('playUrl'),
    episodes: pick('episodes'),
  };
}

/** 请求地址：relative 拼 baseURL；需求方给出的完整地址直接使用 */
function endpointURL(capability) {
  const ep = String(get(`endpoints.${capability}`));
  if (/^https?:\/\//i.test(ep)) return new URL(ep);
  return new URL(`${baseURL()}/${ep.replace(/^\/+/, '')}`);
}

/**
 * 语义参数 → 真实参数名。
 * 只发送需求方已在 paramMap 中确认名称的参数；未确认的一律不发送，
 * 避免把 nav/keyword/id 这类内部名当成内容源参数名。
 */
function buildParams(capability, semantic) {
  const map = DATA_SOURCE.paramMap?.[capability] || {};
  const params = { ...(DATA_SOURCE.staticParams || {}) };
  for (const [semanticKey, value] of Object.entries(semantic)) {
    const realName = map[semanticKey];
    if (!realName || value == null || value === '') continue;
    params[realName] = value;
  }
  return params;
}

/** 响应解析：列表类要数组，详情 / 播放按单对象解析，均按需求方给出的字段名取壳 */
function parseResponse(capability, json) {
  const single = capability === 'detail' || capability === 'play';
  const listKey = DATA_SOURCE.pagination?.listKey ?? null;
  const dataKey = DATA_SOURCE.pagination?.dataKey ?? null;
  let payload = json;
  if (dataKey && payload && typeof payload === 'object' && !Array.isArray(payload) && payload[dataKey] != null) {
    payload = payload[dataKey];
  }
  if (single) {
    const raw = Array.isArray(payload) ? payload[0] : payload;
    return raw && typeof raw === 'object' ? [mapItem(raw)].filter(Boolean) : null;
  }
  const rows = Array.isArray(payload)
    ? payload
    : (listKey && payload && typeof payload === 'object' ? payload[listKey] : null);
  return Array.isArray(rows) ? rows.map(mapItem).filter(Boolean) : null;
}

/** 通用请求执行器：完全由配置驱动，不含任何硬编码接口地址或参数名 */
async function request(capability, semanticParams = {}) {
  const check = readiness(capability);
  if (!check.ready) return unconfigured(capability, check.pending);

  let url;
  try { url = endpointURL(capability); }
  catch { return { ok: false, status: 'error', capability, data: [], pending: [], notice: '接口地址格式待确认' }; }

  const params = buildParams(capability, semanticParams);
  const isGet = String(DATA_SOURCE.method).toUpperCase() === 'GET';
  if (isGet) Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, String(v)));

  const init = { method: isGet ? 'GET' : 'POST', headers: { ...(DATA_SOURCE.headers || {}) } };
  if (!isGet) {
    // Content-Type 只是声明本端序列化格式，可由需求方在 headers 中覆盖
    if (!Object.keys(init.headers).some((h) => h.toLowerCase() === 'content-type')) {
      init.headers['Content-Type'] = 'application/json';
    }
    init.body = JSON.stringify(params);
  }
  if (DATA_SOURCE.auth && typeof DATA_SOURCE.auth === 'object') {
    // 鉴权细节由需求方在配置中给出，这里只按配置透传，不推断规则
    Object.assign(init.headers, DATA_SOURCE.auth.headers || {});
    if (DATA_SOURCE.auth.query) Object.entries(DATA_SOURCE.auth.query).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }

  try {
    const res = await fetch(url.toString(), init);
    if (!res.ok) return { ok: false, status: 'error', capability, data: [], pending: [], notice: `内容源返回 HTTP ${res.status}` };
    const json = await res.json();
    const data = parseResponse(capability, json);
    if (data == null) {
      return { ok: false, status: 'error', capability, data: [], pending: [], notice: '响应结构与字段映射待确认（pagination.listKey / dataKey 未配置或响应不符）' };
    }
    return { ok: true, status: 'ok', capability, data, pending: [] };
  } catch (err) {
    return { ok: false, status: 'error', capability, data: [], pending: [], notice: `请求失败：${err?.message || err}` };
  }
}

/** 浏览：频道 / 分类列表（预留接口，对接后可在频道区接通真实分类） */
export function fetchChannels() {
  return request('channels');
}

/** 浏览：首页、分类、榜单列表 */
export function fetchList({ nav = 'home', channel = 'recommend', keyword = '', page = 1 } = {}) {
  return request('list', { nav, channel, keyword, page });
}

/** 搜索 */
export function search(keyword) {
  return request('search', { keyword });
}

/** 详情 */
export function fetchDetail(id) {
  return request('detail', { id });
}

/** 播放入口：只解析地址，不实现播放器、不生成任何示例播放链接 */
export function resolvePlay(id) {
  return request('play', { id });
}

/**
 * 供界面读取的对接状态摘要。
 * 「接入是否就绪」与「还有多少人工确认项」是两件事：
 *   configured 只看 5 个能力的就绪检查（协议/路径/方法/接口/参数名/字段），
 *   pending / count 仍完整列出全部待补充信息（含版式、发布素材等）。
 */
export function statusSummary() {
  const pending = pendingItems();
  return {
    configured: CAPABILITIES.every((c) => readiness(c).ready),
    host: DATA_SOURCE.host,
    baseURL: baseURL(),
    pending,
    count: pending.length,
  };
}
