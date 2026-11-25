import SwiftUI

// 分类页：类型 + 年份 + 国家 + 类别 + 排序，筛选全在本地做
struct CatalogView: View {
    private let kinds: [(String, String)] = [
        ("movie", "电影"), ("series", "电视剧"), ("anime", "动漫"), ("variety", "综艺")
    ]

    @State private var kindIdx = 0
    @State private var items: [Card] = []
    @State private var metas: [String: Meta] = [:]
    @State private var loading = true
    @State private var err = ""

    @State private var fYear = ""
    @State private var fArea = ""
    @State private var fType = ""
    @State private var sortHigh = false

    @State private var optFor = -1
    @State private var pick: Card?
    @State private var query = ""
    @State private var searching = false
    @State private var searchResults: [Card] = []
    @FocusState private var searchOn: Bool

    struct Meta {
        let type: String
        let area: String
    }

    private var shown: [Card] {
        if !query.trimmingCharacters(in: .whitespaces).isEmpty { return searchResults }
        var list = items
        if !fYear.isEmpty { list = list.filter { matchYear($0.year?.value, fYear) } }
        if !fArea.isEmpty { list = list.filter { metas[$0.idKey]?.area == fArea } }
        if !fType.isEmpty { list = list.filter { metas[$0.idKey]?.type == fType } }
        if sortHigh {
            list = list.sorted {
                (Double($0.score?.value ?? "") ?? 0) > (Double($1.score?.value ?? "") ?? 0)
            }
        }
        return list
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            filterBar
            if optFor >= 0 { optionRow }
            content
        }
        .background(Theme.bg.ignoresSafeArea())
        .task { if items.isEmpty { await load() } }
        .fullScreenCover(item: $pick) { c in DetailView(card: c) }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(isSearchMode ? "搜索" : kinds[kindIdx].1)
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(Theme.fg)

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 13))
                    .foregroundColor(Theme.fgWeak)

                TextField("搜片名（全网聚合）", text: $query)
                    .focused($searchOn)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .font(.system(size: 13))
                    .foregroundColor(Theme.fg)
                    .onSubmit { runSearch() }

                if searching {
                    ProgressView().scaleEffect(0.6).tint(Theme.accentSoft)
                } else if !query.isEmpty {
                    Button {
                        query = ""
                        searchResults = []
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundColor(Theme.fgWeak)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .frame(height: 40)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.white.opacity(0.05))
            )
        }
        .padding(.horizontal, 24)
        .padding(.top, 4)
    }

    // 一行：类型 + 筛选条件（横向可滚）
    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(kinds.enumerated()), id: \.offset) { i, k in
                    FilterChip(text: k.1, on: i == kindIdx) {
                        if i != kindIdx {
                            kindIdx = i
                            optFor = -1
                            Task { await load() }
                        }
                    }
                }

                Rectangle().fill(Color.white.opacity(0.15))
                    .frame(width: 1, height: 16)
                    .padding(.horizontal, 4)

                FilterChip(text: fYear.isEmpty ? "年份" : fYear, on: !fYear.isEmpty) {
                    toggle(0)
                }
                FilterChip(text: fArea.isEmpty ? "国家" : fArea, on: !fArea.isEmpty) {
                    if areas.isEmpty { return }
                    toggle(1)
                }
                FilterChip(text: fType.isEmpty ? "类别" : fType, on: !fType.isEmpty) {
                    if types.isEmpty { return }
                    toggle(2)
                }
                FilterChip(text: sortHigh ? "高分" : "最新", on: sortHigh) {
                    toggle(3)
                }
                FilterChip(text: "重置", on: false) {
                    fYear = ""; fArea = ""; fType = ""; sortHigh = false; optFor = -1
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 8)
        }
    }

    private var optionRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(optionList(), id: \.self) { o in
                    let on = isOn(o)
                    FilterChip(text: o, on: on) {
                        pickOption(o)
                        optFor = -1
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
        }
    }

    private var content: some View {
        ZStack {
            if loading {
                ProgressView().tint(Theme.accentSoft)
            } else if !err.isEmpty {
                Text(err).font(.system(size: 13)).foregroundColor(Theme.fgWeak)
            } else {
                ScrollView {
                    Text("下拉刷新 · \(shown.count) 部")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.fgWeak)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 18)
                    // 按最小 100pt 自适应：iPhone 竖屏 3 列，横屏/平板列数自动变多
                    LazyVGrid(
                        columns: [GridItem(.adaptive(minimum: 100, maximum: 150), spacing: 12)],
                        spacing: 14
                    ) {
                        ForEach(shown) { c in
                            PosterCard(card: c, fixedWidth: nil) { pick = c }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                    .padding(.bottom, 20)
                }
                .refreshable { await refresh() }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var isSearchMode: Bool {
        !query.trimmingCharacters(in: .whitespaces).isEmpty
    }

    /* 搜索走 /api/search（豆瓣 + 采集站两路合并），结果直接顶掉列表；
       清空输入框立刻回到当前分类。 */
    private func runSearch() {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { searchResults = []; return }
        searchOn = false
        searching = true
        Task {
            var out: [Card] = []
            if let r = try? await Api.search(q) {
                out += (r.tmdb ?? [])
                out += (r.collect ?? []).map { c in
                    Card(rawId: c.id, title: c.name, poster: c.poster, posterUrl: nil,
                         year: c.year, score: nil, media: "collect", station: c.stationId)
                }
            }
            await MainActor.run {
                searchResults = out
                searching = false
            }
        }
    }

    // MARK: 数据
    /* 启动加速：先用缓存渲染，再后台静默刷新（切类型时同理由缓存先顶上）。
       下拉刷新 refresh() 会强制走网络。 */
    private func load() async {
        let kind = kinds[kindIdx].0
        if let cached = Api.cachedCatalog(kind) {
            await MainActor.run {
                items = cached.items ?? []
                loading = false
            }
        }
        await refresh(silent: !items.isEmpty)
    }

    private func refresh(silent: Bool = false) async {
        let kind = kinds[kindIdx].0
        err = ""
        if !silent { loading = true }
        metas = [:]
        do {
            let r = try await Api.catalog(kind: kind, page: 1, limit: 500)
            let list = r.items ?? []
            await MainActor.run {
                items = list
                loading = false
            }
            await enrich(list)
        } catch {
            await MainActor.run {
                if items.isEmpty {
                    err = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                }
                loading = false
            }
        }
    }

    // 后台补国家/类型：8 条一批，只补前 80 条，够筛选用
    private func enrich(_ list: [Card]) async {
        let targets = Array(list.prefix(80))
        var idx = 0
        while idx < targets.count {
            let end = min(idx + 8, targets.count)
            let batch = Array(targets[idx..<end])
            await withTaskGroup(of: (String, String, String).self) { group in
                for c in batch {
                    group.addTask {
                        let id = c.idKey
                        guard !id.isEmpty else { return (id, "", "") }
                        let r = try? await Api.play(name: c.title ?? "", year: c.year?.value ?? "")
                        let d = r?.results?.first(where: { $0.detail != nil })?.detail
                        return (id, d?.type ?? "", d?.area ?? "")
                    }
                }
                for await t in group {
                    if !t.0.isEmpty, !t.1.isEmpty || !t.2.isEmpty {
                        await MainActor.run { metas[t.0] = Meta(type: t.1, area: t.2) }
                    }
                }
            }
            idx = end
        }
    }

    private var areas: [String] {
        Array(Set(metas.values.map { $0.area }.filter { !$0.isEmpty })).sorted()
    }
    private var types: [String] {
        Array(Set(metas.values.map { $0.type }.filter { !$0.isEmpty })).sorted()
    }

    private func years() -> [String] {
        var out: [String] = []
        let thisYear = Calendar.current.component(.year, from: Date())
        if thisYear >= 2000 {
            for y in stride(from: thisYear, through: 2000, by: -1) { out.append(String(y)) }
        }
        out.append(contentsOf: ["90年代", "80年代", "70年代", "更早"])
        return out
    }

    private func matchYear(_ y: String?, _ f: String) -> Bool {
        guard let s = y, let n = Int(s) else { return false }
        switch f {
        case "90年代": return n >= 1990 && n <= 1999
        case "80年代": return n >= 1980 && n <= 1989
        case "70年代": return n >= 1970 && n <= 1979
        case "更早": return n < 1970
        default: return String(n) == f
        }
    }

    private func toggle(_ i: Int) {
        optFor = (optFor == i) ? -1 : i
    }

    private func optionList() -> [String] {
        switch optFor {
        case 0: return ["全部"] + years()
        case 1: return ["全部"] + areas
        case 2: return ["全部"] + types
        case 3: return ["全部", "高分优先"]
        default: return []
        }
    }

    private func isOn(_ o: String) -> Bool {
        switch optFor {
        case 0: return o == "全部" ? fYear.isEmpty : o == fYear
        case 1: return o == "全部" ? fArea.isEmpty : o == fArea
        case 2: return o == "全部" ? fType.isEmpty : o == fType
        case 3: return o == "全部" ? !sortHigh : (o == "高分优先" && sortHigh)
        default: return false
        }
    }

    private func pickOption(_ o: String) {
        let v = (o == "全部") ? "" : o
        switch optFor {
        case 0: fYear = v
        case 1: fArea = v
        case 2: fType = v
        case 3: sortHigh = (o == "高分优先")
        default: break
        }
    }
}
