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
    // 视频时间轴上的秒数（不是真实时间戳）—— 暂停冻结、快进跟随、重开可复现
    let at: TimeInterval
}

struct DanmakuItem: Identifiable {
    // 稳定 id：visible() 每帧重建 item，用 UUID 会导致每帧全部重绘闪烁
    var id: String { "\(record.at)|\(record.lane)|\(record.text)" }
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
    // 当前播放秒数，由 PlayerView 的时间观察器写入；弹幕位置完全跟着它走
    @Published var playhead: Double = 0

    private var lane = 0
    private var key = ""

    func load(_ k: String) {
        key = k
        enabled = Prefs.shared.danmakuOn
        records = Prefs.shared.danmakuRecords(k)
        // 系统提示不持久化：用 playhead+0.3 作为位置，几秒后自然飘走
        let tip = DanmakuRecord(text: Self.tipText, lane: 1, color: 0, at: playhead + 0.3)
        records.append(tip)
    }

    func send(_ text: String) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        lane = (lane + 1) % 5
        // 关键：记录"视频第几秒发的"，不是真实时间。否则暂停/拖动都错位、重开看不到。
        let r = DanmakuRecord(text: String(t.prefix(60)), lane: lane,
                              color: Int.random(in: 0..<5), at: playhead)
        records.append(r)
        if records.count > 80 { records.removeFirst(records.count - 80) }
        // 系统提示（at≈0.3 那条）不写盘，避免下次进来重复出现
        Prefs.shared.saveDanmaku(records.filter { $0.text != Self.tipText }, key: key)
    }

    static let tipText = "本地弹幕已开启 · 点下方「弹」发送"

    func setEnabled(_ on: Bool) {
        enabled = on
        Prefs.shared.danmakuOn = on
    }

    // 暂停时 playhead 不动 → 弹幕原地冻结；拖动后按新进度重算位置
    func visible(width: CGFloat) -> [(item: DanmakuItem, x: CGFloat)] {
        let speed: CGFloat = 78
        var out: [(item: DanmakuItem, x: CGFloat)] = []
        for r in records {
            let age = playhead - r.at
            guard age >= 0, age < 40 else { continue }   // 超出窗口的不再计算
            let x = width - CGFloat(age) * speed
            if x > -320 { out.append((DanmakuItem(record: r), x)) }
        }
        return out
    }
}

// 拆成小视图，避免 GeometryReader + TimelineView + ForEach 嵌套导致类型检查超时
struct DanmakuLayer: View {
    @ObservedObject var store: DanmakuStore

    var body: some View {
        GeometryReader { g in
            DanmakuTimeline(store: store, width: g.size.width)
        }
        .allowsHitTesting(false)
    }
}

private struct DanmakuTimeline: View {
    @ObservedObject var store: DanmakuStore
    let width: CGFloat

    var body: some View {
        DanmakuFrame(store: store, width: width)
    }
}

private struct DanmakuFrame: View {
    @ObservedObject var store: DanmakuStore
    let width: CGFloat

    private var items: [(item: DanmakuItem, x: CGFloat)] {
        store.visible(width: width)
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(items, id: \.item.id) { pair in
                DanmakuText(item: pair.item, x: pair.x)
            }
        }
    }
}

private struct DanmakuText: View {
    let item: DanmakuItem
    let x: CGFloat

    private var y: CGFloat { 52 + CGFloat(item.record.lane) * 34 }

    var body: some View {
        Text(item.record.text)
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(item.color)
            .shadow(color: .black.opacity(0.85), radius: 2, y: 1)
            .offset(x: x, y: y)
    }
}

extension Prefs {
    var danmakuOn: Bool {
        get {
            if defaults.object(forKey: "danmakuOn") == nil { return true }
            return defaults.bool(forKey: "danmakuOn")
        }
        set { defaults.set(newValue, forKey: "danmakuOn") }
    }

    private func danmakuKey(_ k: String) -> String { "danmaku|\(k)" }

    func danmakuRecords(_ k: String) -> [DanmakuRecord] {
        guard let data = defaults.data(forKey: danmakuKey(k)) else { return [] }
        return (try? JSONDecoder().decode([DanmakuRecord].self, from: data)) ?? []
    }

    func saveDanmaku(_ list: [DanmakuRecord], key: String) {
        if let data = try? JSONEncoder().encode(list) {
            defaults.set(data, forKey: danmakuKey(key))
        }
    }
}
