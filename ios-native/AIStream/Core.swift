import Foundation

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
    let ep: String?
    let pos: FlexStr?
    let dur: FlexStr?
    let t: FlexStr?

    enum CodingKeys: String, CodingKey {
        case rawId = "id"
        case title, poster, year, score, media, station
        case posterUrl = "poster_url"
        case ep, pos, dur, t
    }

    // 统一出口：谁有就用谁，调用方不用关心数据来自哪个接口
    var posterPath: String? {
        if let p = poster, !p.isEmpty { return p }
        if let u = posterUrl, !u.isEmpty { return u }
        return nil
    }

    var idKey: String { rawId?.value ?? "" }
    var id: String { rawId?.value ?? (title ?? UUID().uuidString) }

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

    static func home() async throws -> HomeResp {
        try await get("/api/home")
    }

    static func catalog(kind: String, page: Int = 1, limit: Int = 500) async throws -> CatalogResp {
        let k = kind.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? kind
        return try await get("/api/up/catalog?kind=\(k)&limit=\(limit)&page=\(page)")
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
