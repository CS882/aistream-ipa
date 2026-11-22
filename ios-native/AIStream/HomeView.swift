import SwiftUI

// 首页：通栏 Hero + 一行行栏目，整页一起滚（与 Android 版同构）
struct HomeView: View {
    @EnvironmentObject private var app: AppState
    @State private var shelves: [Shelf] = []
    @State private var banner: [Card] = []
    @State private var cur = 0
    @State private var loading = true
    @State private var err = ""
    @State private var pick: Card?
    // 首页直接搜索：回车即出结果，不跳分类页
    @State private var query = ""
    @State private var searching = false
    @State private var searchResults: [Card] = []
    @FocusState private var searchOn: Bool

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            if loading {
                ProgressView().tint(Theme.accentSoft)
            } else if !err.isEmpty {
                VStack(spacing: 10) {
                    Text(err).font(.system(size: 13)).foregroundColor(Theme.fgWeak)
                    Button("重试") { Task { await load() } }
                        .font(.system(size: 13)).foregroundColor(Theme.accentSoft)
                }
            } else {
                VStack(spacing: 0) {
                    // 首页搜索框：直接输入片名回车搜索，结果覆盖首页内容
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
                                searchOn = false
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 14))
                                    .foregroundColor(Theme.fgWeak)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                    .frame(height: 38)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color.white.opacity(0.05))
                    )
                    .padding(.horizontal, 18)
                    .padding(.bottom, 6)

                    ScrollView {
                        if isSearchMode {
                            // 搜索结果：3 列网格，跟分类页一致
                            LazyVGrid(
                                columns: [GridItem(.adaptive(minimum: 100, maximum: 150), spacing: 12)],
                                spacing: 14
                            ) {
                                ForEach(searchResults) { c in
                                    PosterCard(card: c, fixedWidth: nil) { pick = c }
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                            .padding(.bottom, 26)
                        } else {
                            VStack(spacing: 0) {
                                hero
                                // 全部 13 个源站都显示，空站给提示而不是直接丢掉
                                ForEach(Array(allShelves.enumerated()), id: \.offset) { _, s in
                                    shelfRow(s)
                                }
                            }
                            .padding(.bottom, 26)
                        }
                    }
                }
            }
        }
        .task { if shelves.isEmpty { await load() } }
        .fullScreenCover(item: $pick) { c in
            DetailView(card: c)
        }
    }

    private var allShelves: [Shelf] { shelves }

    private var isSearchMode: Bool {
        !query.trimmingCharacters(in: .whitespaces).isEmpty
    }

    /* 首页直接搜索 /api/search：豆瓣卡 + 采集站两路合并，结果覆盖首页内容。
       清空输入框恢复首页。 */
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

    // MARK: 大 Hero
    private var hero: some View {
        TabView(selection: $cur) {
            ForEach(Array(banner.enumerated()), id: \.offset) { i, c in
                heroPage(c).tag(i)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: banner.count > 1 ? .always : .never))
        .frame(height: 320)
    }

    private func heroPage(_ c: Card) -> some View {
        ZStack(alignment: .bottomLeading) {
            GeometryReader { g in
                AsyncImage(url: Api.posterURL(c.posterPath)) { phase in
                    if let img = phase.image {
                        img.resizable().aspectRatio(contentMode: .fill)
                    } else {
                        Theme.card
                    }
                }
                .frame(width: g.size.width, height: g.size.height)
                .clipped()
            }

            // 压暗：盖住放大后的噪点，也让白字可读
            Color(hex: 0x05060A).opacity(0.65)
            LinearGradient(
                colors: [.clear, Color(hex: 0x05060A).opacity(0.95)],
                startPoint: .center, endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 0) {
                Text(c.title ?? "")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .shadow(color: .black.opacity(0.6), radius: 8, y: 2)

                HStack(spacing: 8) {
                    if let y = c.year?.value, !y.isEmpty {
                        Text(y).font(.system(size: 14)).foregroundColor(.white.opacity(0.85))
                    }
                    if !c.scoreText.isEmpty {
                        Text(c.scoreText).font(.system(size: 14)).foregroundColor(Theme.accentSoft)
                    }
                }
                .padding(.top, 8)

                Button {
                    pick = c
                } label: {
                    Text("▶  播放")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 30)
                        .frame(height: 44)
                        .background(Capsule().fill(Theme.grad))
                }
                .buttonStyle(.plain)
                .padding(.top, 16)
            }
            .padding(.horizontal, 30)
            .padding(.bottom, 28)
        }
    }

    // MARK: 栏目行
    private func shelfRow(_ s: Shelf) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(s.label ?? "")
                .font(.system(size: 19, weight: .bold))
                .foregroundColor(Theme.fg)
                .padding(.horizontal, 24)
                .padding(.top, 14)

            if (s.items ?? []).isEmpty {
                Text("暂无内容")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.fgWeak)
                    .padding(.horizontal, 24)
                    .frame(height: 60)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 14) {
                        ForEach(s.items ?? []) { c in
                            PosterCard(card: c) { pick = c }
                        }
                    }
                    .padding(.horizontal, 17)
                }
            }
        }
    }

    private func load() async {
        loading = true
        err = ""
        do {
            let r = try await Api.home()
            // 显示全部源站（含空站），banner 只从有内容的站取
            let cols = r.columns ?? []
            await MainActor.run {
                shelves = cols
                banner = Array(collectBanner(cols).prefix(6))
                loading = false
            }
        } catch {
            await MainActor.run {
                err = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                loading = false
            }
        }
    }

    private func collectBanner(_ cols: [Shelf]) -> [Card] {
        var seen = Set<String>()
        var out: [Card] = []
        for col in cols {
            for c in col.items ?? [] {
                let key = (c.title ?? "") + "|" + (c.year?.value ?? "")
                if seen.contains(key) { continue }
                seen.insert(key)
                if Api.posterURL(c.posterPath) == nil { continue }
                out.append(c)
                if out.count >= 6 { return out }
            }
        }
        return out
    }
}

// 海报卡：默认 118 宽（首页横排），传 fixedWidth: nil 就跟随父容器（分类页网格）
struct PosterCard: View {
    let card: Card
    var fixedWidth: CGFloat? = 118
    let tap: () -> Void

    var body: some View {
        Button(action: tap) {
            VStack(alignment: .leading, spacing: 0) {
                poster

                Text(card.title ?? "")
                    .font(.system(size: 11))
                    .foregroundColor(Theme.fg)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(height: 30, alignment: .topLeading)
                    .padding(.top, 7)

                Text(card.scoreText)
                    .font(.system(size: 10))
                    .foregroundColor(Theme.fgWeak)
                    .frame(height: 14, alignment: .topLeading)
            }
            .frame(width: fixedWidth)
        }
        .buttonStyle(PressScaleStyle())
    }

    /* 宽度由外部决定（118 或网格列宽），高度按 118:171 算出来 ——
       绝对不能写死 frame(width: 118)，否则放进网格会溢出列宽、文字互相叠。 */
    private var poster: some View {
        Rectangle()
            .fill(Theme.card)
            .aspectRatio(118.0 / 171.0, contentMode: .fit)
            .overlay(
                GeometryReader { g in
                    AsyncImage(url: Api.posterURL(card.posterPath)) { phase in
                        if let img = phase.image {
                            img.resizable()
                                .aspectRatio(contentMode: .fill)
                                .frame(width: g.size.width, height: g.size.height)
                                .clipped()
                        } else {
                            Theme.card
                        }
                    }
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

// 按下缩放，模仿 tvOS 的按压反馈
struct PressScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
    }
}
