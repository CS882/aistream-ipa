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
        else if let i = try? c.decode(Int.self) { value = String(i) }
        else if let dbl = try? c.decode(Double.self) { value = String(format: "%.1f", dbl) }
        else { value = "" }
    }
}

struct Card: Decodable, Identifiable {
    // 服务端的 id 字段读进 rawId，避免和 Identifiable 要求的 id 重名
    let rawId: FlexStr?
    let title: String?
    let poster: String?
    let year: FlexStr?
    let score: FlexStr?
    let media: String?
    let station: String?

    enum CodingKeys: String, CodingKey {
        case rawId = "id"
        case title, poster, year, score, media, station
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

    static func search(_ q: String) async throws -> PlayResp {
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
