import Foundation
import AVFoundation

// MARK: - 本地存储
final class Prefs {
    static let shared = Prefs()
    private let d = UserDefaults.standard

    static let defaultHost = "fnos.jiulingkeji.asia"
    static let defaultPort = "8890"

    var host: String {
        get { (d.string(forKey: "host") ?? "").isEmpty ? Self.defaultHost : d.string(forKey: "host")! }
        set { d.set(newValue, forKey: "host") }
    }
    var port: String {
        get { (d.string(forKey: "port") ?? "").isEmpty ? Self.defaultPort : d.string(forKey: "port")! }
        set { d.set(newValue, forKey: "port") }
    }
    var base: String { "http://\(host):\(port)" }

    var token: String {
        get { d.string(forKey: "token") ?? "" }
        set { d.set(newValue, forKey: "token") }
    }
    var user: String {
        get { d.string(forKey: "user") ?? "" }
        set { d.set(newValue, forKey: "user") }
    }
    var pass: String {
        get { d.string(forKey: "pass") ?? "" }
        set { d.set(newValue, forKey: "pass") }
    }
    var rememberPass: Bool {
        get {
            if d.object(forKey: "rememberPass") == nil { return true }
            return d.bool(forKey: "rememberPass")
        }
        set { d.set(newValue, forKey: "rememberPass") }
    }
    var siteName: String {
        get { d.string(forKey: "siteName") ?? "" }
        set { d.set(newValue, forKey: "siteName") }
    }

    /* 续播进度：key = 片 id + 集名。本地存一份，退出播放器立刻能接着看，
       不依赖服务端历史接口的刷新延迟。 */
    func progressKey(_ id: String, _ ep: String) -> String { "prog|\(id)|\(ep)" }
    func getProgress(_ id: String, _ ep: String) -> (pos: Double, dur: Double) {
        let k = progressKey(id, ep)
        return (d.double(forKey: k + ".pos"), d.double(forKey: k + ".dur"))
    }
    func setProgress(_ id: String, _ ep: String, pos: Double, dur: Double) {
        let k = progressKey(id, ep)
        d.set(pos, forKey: k + ".pos")
        d.set(dur, forKey: k + ".dur")
    }

    var configured: Bool { !token.isEmpty }

    // 供同文件 extension 读写（Swift 的 private 仅限声明体内部，extension 访问不到）
    var defaults: UserDefaults { d }

    func clear() {
        ["token", "user", "pass", "siteName"].forEach { d.removeObject(forKey: $0) }
    }
}

// MARK: - 模型
struct LoginResp: Decodable {
    let token: String?
    let user: LoginUser?
    struct LoginUser: Decodable {
        let username: String?
        let role: String?
    }
}

// 有些字段服务端会返回数字、有些返回字符串，统一按字符串读
struct FlexStr: Decodable {
    let value: String
    // 便捷构造：本地组装 Card 时用（服务端数据走 init(from:)）
    init(_ v: String) { value = v }
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self) { value = s }
        else if let i = try? c.decode(Int64.self) { value = String(i) }
        else if let b = try? c.decode(Bool.self) { value = b ? "1" : "0" }
        else if let dbl = try? c.decode(Double.self) {
            value = dbl.truncatingRemainder(dividingBy: 1) == 0
                ? String(format: "%.0f", dbl) : String(format: "%.1f", dbl)
        }
        else { value = "" }
    }
}

struct Card: Decodable, Identifiable {
    // 服务端的 id 字段读进 rawId，避免和 Identifiable 要求的 id 重名
    let rawId: FlexStr?
    let title: String?
    // home 接口给的是 poster，catalog/api/up 给的是 poster_url —— 两个都要认
    let poster: String?
    let posterUrl: String?
    let year: FlexStr?
    let score: FlexStr?
    let media: String?
    let station: String?
    // 历史接口会带进度；普通 catalog/home 没有这些字段，所以都是可选
    // 给默认值，这样搜索/收藏构造 Card 时不用每个都传
    // ep 服务端有时是"HD国语"字符串，有时是数字 0 —— 必须 FlexStr，
    // 否则整条 Card 解码失败，[Card] 数组会整批变空（观看历史一直空就是这原因）
    var ep: FlexStr? = nil
    var epTotal: FlexStr? = nil
    var pos: FlexStr? = nil
    var dur: FlexStr? = nil
    var t: FlexStr? = nil

    enum CodingKeys: String, CodingKey {
        case rawId = "id"
        case title, poster, year, score, media, station
        case posterUrl = "poster_url"
        case ep, epTotal, pos, dur, t
    }

    // 统一出口：谁有就用谁，调用方不用关心数据来自哪个接口
    var posterPath: String? {
        if let p = poster, !p.isEmpty { return p }
        if let u = posterUrl, !u.isEmpty { return u }
        return nil
    }

    var idKey: String { rawId?.value ?? "" }
    // 稳定身份：内容相同 id 必须相同，否则 ForEach 每帧重建、列表闪烁。
    // 优先服务端 id；没有时用 片名|年份|海报 组合，不用 UUID（每次读都变）。
    var id: String {
        if let r = rawId?.value, !r.isEmpty { return r }
        return "\(title ?? "")|\(year?.value ?? "")|\(posterPath ?? "")"
    }

    var scoreText: String {
        guard let s = score?.value, let v = Double(s), v > 0 else { return "" }
        return String(format: "%.1f", v)
    }
}

struct Shelf: Decodable {
    let label: String?
    let items: [Card]?
}

struct HomeResp: Decodable {
    let columns: [Shelf]?
}

struct CatalogResp: Decodable {
    let items: [Card]?
}

struct PlayResp: Decodable {
    let results: [PlayRes]?
    let hasParse: Bool?
}

struct PlayRes: Decodable {
    let station: String?
    let name: String?
    let year: String?
    let poster: String?
    let remark: String?
    let sources: [Source]?
    let detail: Detail?
}

struct Source: Decodable {
    let from: String?
    let episodes: [Episode]?
}

struct Episode: Decodable, Identifiable {
    let name: String?
    let url: String?
    var id: String { (url ?? "") + "|" + (name ?? "") }
}

struct Detail: Decodable {
    let type: String?
    let area: String?
    let plot: String?
    let actors: String?
    let director: String?
    let remark: String?
}

// MARK: - 接口
enum ApiError: LocalizedError {
    case msg(String)
    var errorDescription: String? {
        switch self { case .msg(let s): return s }
    }
}

struct Api {
    static var base: String { Prefs.shared.base }

    private static func raw(_ path: String, method: String, body: [String: Any]?) async throws -> Data {
        guard let url = URL(string: base + path) else { throw ApiError.msg("服务器地址无效") }
        var r = URLRequest(url: url)
        r.httpMethod = method
        r.timeoutInterval = 35
        let t = Prefs.shared.token
        if !t.isEmpty { r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        if let b = body {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try JSONSerialization.data(withJSONObject: b, options: [])
        }
        let (data, resp) = try await URLSession.shared.data(for: r)
        guard let h = resp as? HTTPURLResponse else { throw ApiError.msg("没有拿到响应") }
        if h.statusCode == 401 { throw ApiError.msg("登录状态已过期，重新登录一次") }
        if h.statusCode >= 400 { throw ApiError.msg("服务器返回 \(h.statusCode)") }
        return data
    }

    private static func get<T: Decodable>(_ path: String) async throws -> T {
        let data = try await raw(path, method: "GET", body: nil)
        return try JSONDecoder().decode(T.self, from: data)
    }

    static func login(user: String, pass: String) async throws -> LoginResp {
        let data = try await raw("/api/auth/login", method: "POST",
                                body: ["username": user, "password": pass])
        return try JSONDecoder().decode(LoginResp.self, from: data)
    }

    // 缓存 key 按 kind 区分，切分类时各用各的，不会串数据
    static func catalogKey(_ kind: String) -> String { "catalog|\(kind)" }

    static func cachedHome() -> HomeResp? { ApiCache.load("home") }
    static func cachedCatalog(_ kind: String) -> CatalogResp? { ApiCache.load(catalogKey(kind)) }

    static func home() async throws -> HomeResp {
        let data = try await raw("/api/home", method: "GET", body: nil)
        ApiCache.save(data, "home")
        return try JSONDecoder().decode(HomeResp.self, from: data)
    }

    static func catalog(kind: String, page: Int = 1, limit: Int = 500) async throws -> CatalogResp {
        let k = kind.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? kind
        let data = try await raw("/api/up/catalog?kind=\(k)&limit=\(limit)&page=\(page)",
                                 method: "GET", body: nil)
        // 只有第一页全量结果值得缓存；翻页结果不覆盖首屏缓存
        if page == 1 { ApiCache.save(data, catalogKey(kind)) }
        return try JSONDecoder().decode(CatalogResp.self, from: data)
    }

    static func play(name: String, year: String) async throws -> PlayResp {
        var p = "/api/play?name=" + (name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")
        if !year.isEmpty { p += "&year=" + (year.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "") }
        return try await get(p)
    }

    static func search(_ q: String) async throws -> SearchResp {
        try await get("/api/search?q=" + (q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""))
    }

    // 海报走站点代理，避免图床防盗链
    static func posterURL(_ p: String?) -> URL? {
        guard var s = p, !s.isEmpty else { return nil }
        if s.hasPrefix("http") {
            let enc = s.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
            return URL(string: base + "/api/dimg?u=" + enc)
        }
        if !s.hasPrefix("/") { s = "/" + s }
        return URL(string: base + s)
    }
}

// MARK: - 用户 / 收藏 / 直播

struct ListResp: Decodable {
    let items: [Card]?
}

struct VipInfo: Decodable {
    let level: FlexStr?
    let name: String?
    let noAds: Bool?
    // 服务端 pointMul 返回的是数字（2），不是字符串 —— 必须用 FlexStr，
    // 否则 JSONDecoder 会认为整个 PointsResp 解码失败，积分页全变默认值
    let pointMul: FlexStr?
    let expire: FlexStr?
    let days: FlexStr?
}

struct CheckinInfo: Decodable {
    let today: Bool?
    let streak: FlexStr?
    let last: String?
}

struct InviteInfo: Decodable {
    let code: String?
    let invited: FlexStr?
    let perInvite: FlexStr?
}

struct DailyInfo: Decodable {
    let watchMin: FlexStr?
    let date: String?
}

struct PointsResp: Decodable {
    let points: FlexStr?
    let vip: VipInfo?
    let checkin: CheckinInfo?
    let invite: InviteInfo?
    let daily: DailyInfo?
}

struct CheckinResp: Decodable {
    let ok: Bool?
    let gained: FlexStr?
    let streak: FlexStr?
    let points: FlexStr?
    let msg: String?
    let error: String?
}

struct IptvCh: Decodable, Identifiable {
    let cid: FlexStr?
    let name: String?
    let group: String?
    let src: String?
    let direct: Bool?
    let logo: String?
    var id: String { (cid?.value ?? "") + "|" + (name ?? "") }
}

struct IptvResp: Decodable {
    let enabled: Bool?
    let denied: Bool?
    let count: Int?
    let error: String?
    let channels: [IptvCh]?
    let groupOrder: [String]?
}

extension Api {
    static func pointsMe() async throws -> PointsResp {
        try await get("/api/points/me")
    }

    static func checkin() async throws -> CheckinResp {
        let data = try await raw("/api/checkin", method: "POST", body: [:])
        return try JSONDecoder().decode(CheckinResp.self, from: data)
    }

    static func favs() async throws -> [Card] {
        let r: ListResp = try await get("/api/fav")
        return r.items ?? []
    }

    static func history() async throws -> [Card] {
        let r: ListResp = try await get("/api/history")
        return r.items ?? []
    }

    static func iptv() async throws -> IptvResp {
        try await get("/api/iptv")
    }
}

struct CollectItem: Decodable {
    let id: FlexStr?
    let name: String?
    let poster: String?
    let year: FlexStr?
    let stationId: String?
}

struct SearchResp: Decodable {
    let tmdb: [Card]?
    let collect: [CollectItem]?
}

struct OkResp: Decodable {
    let ok: Bool?
    let on: Bool?
    let error: String?
}

struct PublicResp: Decodable {
    let siteName: String?
}

extension Api {
    static func publicInfo() async throws -> PublicResp {
        try await get("/api/public")
    }

    // 收藏 / 取消收藏，返回操作后的状态
    static func toggleFav(_ c: Card) async throws -> Bool {
        let body: [String: Any] = [
            "add": [
                "id": c.idKey,
                "title": c.title ?? "",
                "poster": c.posterPath ?? "",
                "year": c.year?.value ?? "",
            ]
        ]
        let data = try await raw("/api/fav", method: "POST", body: body)
        let r = try JSONDecoder().decode(OkResp.self, from: data)
        return r.on ?? false
    }

    // 观看历史：进播放器时写一条，退出时把进度补上；同时落本地供续播
    static func postHistory(id: String, title: String, poster: String, year: String,
                            ep: String, pos: Double, dur: Double) {
        let posInt = Int(max(0, pos))
        let durInt = Int(max(0, dur))
        if !id.isEmpty {
            Prefs.shared.setProgress(id, ep, pos: pos, dur: dur)
        }
        let body: [String: Any] = [
            "id": id, "title": title, "poster": poster, "year": year,
            "ep": ep, "epTotal": "", "pos": "\(posInt)", "dur": "\(durInt)",
        ]
        Task { _ = try? await raw("/api/history", method: "POST", body: body) }
    }
}


// MARK: - 兑换 / 邀请 / 注册
// 重新定义：上面的 id 冲突，用 CodingKeys 映射
struct RedeemGood: Decodable, Identifiable {
    let rid: String?
    let title: String?
    let desc: String?
    let kind: String?
    let level: FlexStr?
    let days: FlexStr?
    let cost: FlexStr?
    let stock: FlexStr?
    let soldOut: Bool?
    enum CodingKeys: String, CodingKey {
        case rid = "id", title, desc, kind, level, days, cost, stock, soldOut
    }
    var id: String { rid ?? UUID().uuidString }
}

struct RedeemResp: Decodable {
    let enabled: Bool?
    let items: [RedeemGood]?
    let me: RedeemMe?
}

struct RedeemMe: Decodable {
    let points: FlexStr?
    let vip: VipInfo?
}

struct InviteResp: Decodable {
    let code: String?
    let invited: FlexStr?
    let perInvite: FlexStr?
}

struct RegResp: Decodable {
    let token: String?
    let user: LoginResp.LoginUser?
    let error: String?
}

// 追剧项：本地存（基于收藏 + 历史），服务端无 subscribe 接口
struct FollowItem: Codable, Identifiable {
    let id: String
    let title: String
    let poster: String
    let year: String
    let lastEp: String
    let addAt: Double
    var uid: String { id }
}


extension Api {
    // 积分兑换商品列表 + 我的积分
    static func redeemList() async throws -> RedeemResp {
        try await get("/api/redeem")
    }
    // 兑换商品（返回 ok / error）
    static func redeem(id: String) async throws -> OkResp {
        let data = try await raw("/api/redeem", method: "POST", body: ["id": id])
        return try JSONDecoder().decode(OkResp.self, from: data)
    }
    // 邀请码
    static func invite() async throws -> InviteResp {
        try await get("/api/invite")
    }
    // 修改密码
    static func changePassword(old: String, new: String) async throws -> OkResp {
        let data = try await raw("/api/auth/change-password", method: "POST",
                                body: ["oldPassword": old, "newPassword": new])
        return try JSONDecoder().decode(OkResp.self, from: data)
    }
    // 注册（不需要 token）
    static func register(user: String, pass: String, invite: String) async throws -> RegResp {
        let data = try await raw("/api/auth/register", method: "POST",
                                body: ["username": user, "password": pass, "invite": invite])
        return try JSONDecoder().decode(RegResp.self, from: data)
    }
    // 直播流地址：必须带 token，走服务端代理
    static func iptvStreamURL(cid: String) -> URL? {
        var u = base + "/api/iptv/stream?ch="
        u += cid.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? cid
        return URL(string: u)
    }
    // 直播流请求带 token（AVPlayer 默认不带，需要 URLRequest）
    static func iptvStreamRequest(cid: String) -> URLRequest? {
        guard let u = iptvStreamURL(cid: cid) else { return nil }
        var r = URLRequest(url: u)
        let t = Prefs.shared.token
        if !t.isEmpty { r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        return r
    }
}


extension Prefs {
    private var followKey: String { "follows" }
    var follows: [FollowItem] {
        get {
            guard let data = d.data(forKey: followKey) else { return [] }
            return (try? JSONDecoder().decode([FollowItem].self, from: data)) ?? []
        }
        set {
            if let data = try? JSONEncoder().encode(newValue) { d.set(data, forKey: followKey) }
        }
    }
    func addFollow(_ item: FollowItem) {
        var list = follows
        if !list.contains(where: { $0.id == item.id }) {
            list.insert(item, at: 0)
            follows = list
            NotificationCenter.default.post(name: Notification.Name("aistream.followChanged"), object: nil)
        }
    }
    func removeFollow(id: String) {
        follows = follows.filter { $0.id != id }
        NotificationCenter.default.post(name: Notification.Name("aistream.followChanged"), object: nil)
    }
    func isFollowed(id: String) -> Bool {
        follows.contains { $0.id == id }
    }
}

// MARK: - 线路测速
// 并发探测每条线路首包延迟（Range 请求读 1 字节），与 Android Speed.kt 同逻辑
struct LineSpeed {
    static let fail = 999999
    static let shared = LineSpeed()

    func text(_ ms: Int) -> String {
        if ms >= LineSpeed.fail { return "超时" }
        if ms < 1000 { return "\(ms)ms" }
        return String(format: "%.1fs", Double(ms) / 1000.0)
    }

    func probe(_ urlString: String) async -> Int {
        guard let u = URL(string: urlString) else { return LineSpeed.fail }
        var req = URLRequest(url: u)
        req.httpMethod = "GET"
        req.setValue("*/*", forHTTPHeaderField: "Accept")
        req.setValue("bytes=0-4095", forHTTPHeaderField: "Range")
        req.setValue(Api.UA, forHTTPHeaderField: "User-Agent")
        req.timeoutInterval = 6
        let t0 = Date()
        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            let ms = Int(Date().timeIntervalSince(t0) * 1000)
            if let h = resp as? HTTPURLResponse, !(200..<400).contains(h.statusCode) {
                return LineSpeed.fail
            }
            return ms
        } catch {
            return LineSpeed.fail
        }
    }

    // 并发测所有线路（每条取第一集 URL），返回下标→毫秒
    func testAll(_ lines: [[String]]) async -> [Int: Int] {
        // lines[i] 是该线路所有集的 URL，取第一条
        var results: [Int: Int] = [:]
        await withTaskGroup(of: (Int, Int).self) { group in
            for (i, urls) in lines.enumerated() {
                guard let first = urls.first, !first.isEmpty else {
                    results[i] = LineSpeed.fail
                    continue
                }
                group.addTask {
                    (i, await self.probe(first))
                }
            }
            for await (idx, ms) in group { results[idx] = ms }
        }
        return results
    }
}

extension Api {
    static var UA: String {
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
    }
}

// MARK: - 音频会话（PiP 硬性前置条件）
// Apple 要求使用画中画必须配置后台音频播放；
// 不设置 AVAudioSession 会导致 isPictureInPicturePossible 一直为 false。
enum AudioSessionManager {
    static func activateForPlayback() {
        do {
            let s = AVAudioSession.sharedInstance()
            // PiP 标准配置：.playback 类别，不指定 mode（Apple 官方示例）
            try s.setCategory(.playback, mode: .default,
                              options: [.allowAirPlay, .allowBluetooth])
            try s.setActive(true, options: [])
        } catch {
            // 音频会话失败不阻断播放，但 PiP 可能不可用
            print("AVAudioSession 配置失败: \(error.localizedDescription)")
        }
    }
}
