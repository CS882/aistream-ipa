import SwiftUI
import AVFoundation

// MARK: - 本地数据缓存（冷启动秒开）
/* 首页 / 分类的原始 JSON 落在 Caches 目录。
   冷启动先把上次的数据画出来，网络回来后再静默替换 —— 不再白屏等接口。 */
enum ApiCache {
    private static let dir = FileManager.default.urls(
        for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("aistream-api", isDirectory: true)

    private static func file(_ key: String) -> URL {
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir.appendingPathComponent(key + ".json")
    }

    static func load<T: Decodable>(_ key: String, as: T.Type = T.self) -> T? {
        guard let d = try? Data(contentsOf: file(key)) else { return nil }
        return try? JSONDecoder().decode(T.self, from: d)
    }

    static func save(_ data: Data, _ key: String) {
        try? data.write(to: file(key), options: .atomic)
    }

    static func clear() {
        try? FileManager.default.removeItem(at: dir)
    }
}

// MARK: - 弹幕
/* 站点没有弹幕接口（Web 版也是纯本地发送），所以不伪造站点数据：
   只保存用户在本地发送的弹幕，首次开启给一条系统提示让功能可见。 */
struct DanmakuRecord: Codable {
    let text: String
    let lane: Int
    let color: Int
    let at: TimeInterval
}

struct DanmakuItem: Identifiable {
    let id = UUID()
    let record: DanmakuRecord
    var born: Date { Date(timeIntervalSince1970: record.at) }
    var color: Color {
        switch record.color % 5 {
        case 0: return .white
        case 1: return .yellow
        case 2: return .cyan
        case 3: return .pink
        default: return .green
        }
    }
}

final class DanmakuStore: ObservableObject {
    @Published var records: [DanmakuRecord] = []
    @Published var enabled: Bool = Prefs.shared.danmakuOn

    private var lane = 0
    private var key = ""

    func load(_ k: String) {
        key = k
        enabled = Prefs.shared.danmakuOn
        let saved = Prefs.shared.danmakuRecords(k)
        if saved.isEmpty {
            // 系统提示，不冒充用户/站点弹幕
            records = [DanmakuRecord(text: "本地弹幕已开启 · 点下方「弹」发送",
                                     lane: 1, color: 0,
                                     at: Date().addingTimeInterval(0.6).timeIntervalSince1970)]
        } else {
            records = saved
        }
    }

    func send(_ text: String) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        lane = (lane + 1) % 5
        let r = DanmakuRecord(text: String(t.prefix(60)), lane: lane,
                              color: Int.random(in: 0..<5), at: Date().timeIntervalSince1970)
        records.append(r)
        if records.count > 80 { records.removeFirst(records.count - 80) }
        Prefs.shared.saveDanmaku(records, key: key)
    }

    func setEnabled(_ on: Bool) {
        enabled = on
        Prefs.shared.danmakuOn = on
    }

    // 一条弹幕约 8~11 秒飘过屏幕；只返回当前还在画面内的
    func visible(at now: Date, width: CGFloat) -> [(item: DanmakuItem, x: CGFloat)] {
        let speed: CGFloat = 78
        var out: [(item: DanmakuItem, x: CGFloat)] = []
        for r in records {
            let age = now.timeIntervalSince1970 - r.at
            guard age >= 0 else { continue }
            let x = width - CGFloat(age) * speed
            if x > -320 { out.append((DanmakuItem(record: r), x)) }
        }
        return out
    }
}

struct DanmakuLayer: View {
    @ObservedObject var store: DanmakuStore

    var body: some View {
        GeometryReader { g in
            TimelineView(.animation) { ctx in
                ZStack(alignment: .topLeading) {
                    ForEach(store.visible(at: ctx.date, width: g.size.width), id: \.item.id) { pair in
                        Text(pair.item.text)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(pair.item.color)
                            .shadow(color: .black.opacity(0.85), radius: 2, y: 1)
                            .offset(x: pair.x, y: 52 + CGFloat(pair.item.record.lane) * 34)
                    }
                }
            }
        }
        .allowsHitTesting(false)
    }
}

extension Prefs {
    var danmakuOn: Bool {
        get {
            if d.object(forKey: "danmakuOn") == nil { return true }
            return d.bool(forKey: "danmakuOn")
        }
        set { d.set(newValue, forKey: "danmakuOn") }
    }

    private func danmakuKey(_ k: String) -> String { "danmaku|\(k)" }

    func danmakuRecords(_ k: String) -> [DanmakuRecord] {
        guard let data = d.data(forKey: danmakuKey(k)) else { return [] }
        return (try? JSONDecoder().decode([DanmakuRecord].self, from: data)) ?? []
    }

    func saveDanmaku(_ list: [DanmakuRecord], key: String) {
        if let data = try? JSONEncoder().encode(list) {
            d.set(data, forKey: danmakuKey(key))
        }
    }
}
