import SwiftUI

// 首页：通栏 Hero + 一行行栏目，整页一起滚（与 Android 版同构）
struct HomeView: View {
    @State private var shelves: [Shelf] = []
    @State private var banner: [Card] = []
    @State private var cur = 0
    @State private var loading = true
    @State private var err = ""
    @State private var pick: Card?

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
                ScrollView {
                    VStack(spacing: 0) {
                        hero
                        ForEach(Array(shelves.enumerated()), id: \.offset) { _, s in
                            shelfRow(s)
                        }
                    }
                    .padding(.bottom, 26)
                }
            }
        }
        .task { if shelves.isEmpty { await load() } }
        .fullScreenCover(item: $pick) { c in
            DetailView(card: c)
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
                AsyncImage(url: Api.posterURL(c.poster)) { phase in
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

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 0) {
                    ForEach(s.items ?? []) { c in
                        PosterCard(card: c) { pick = c }
                    }
                }
                .padding(.horizontal, 17)
            }
        }
    }

    private func load() async {
        loading = true
        err = ""
        do {
            let r = try await Api.home()
            let cols = (r.columns ?? []).filter { !($0.items ?? []).isEmpty }
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
                if Api.posterURL(c.poster) == nil { continue }
                out.append(c)
                if out.count >= 6 { return out }
            }
        }
        return out
    }
}

// 海报卡：118 宽、12 圆角、两行标题 + 评分（与 Android 版一致）
struct PosterCard: View {
    let card: Card
    let tap: () -> Void

    var body: some View {
        Button(action: tap) {
            VStack(alignment: .leading, spacing: 0) {
                AsyncImage(url: Api.posterURL(card.poster)) { phase in
                    if let img = phase.image {
                        img.resizable().aspectRatio(contentMode: .fill)
                    } else {
                        Theme.card
                    }
                }
                .frame(width: 118, height: 171)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                Text(card.title ?? "")
                    .font(.system(size: 11))
                    .foregroundColor(Theme.fg)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(height: 30, alignment: .topLeading)
                    .padding(.top, 7)

                if !card.scoreText.isEmpty {
                    Text(card.scoreText)
                        .font(.system(size: 10))
                        .foregroundColor(Theme.fgWeak)
                }
            }
            .frame(width: 118)
            .padding(.horizontal, 5)
            .padding(.bottom, 12)
        }
        .buttonStyle(PressScaleStyle())
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
