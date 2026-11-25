import SwiftUI
import AVKit

// 收藏 / 历史：共用一套网格，数据源不同
struct CardGridView: View {
    let title: String
    let loader: () async throws -> [Card]

    @State private var items: [Card] = []
    @State private var loading = true
    @State private var err = ""
    @State private var pick: Card?

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            if loading {
                ProgressView().tint(Theme.accentSoft)
            } else if !err.isEmpty {
                Text(err).font(.system(size: 13)).foregroundColor(Theme.fgWeak)
            } else if items.isEmpty {
                VStack(spacing: 8) {
                    Text(title).font(.system(size: 20, weight: .bold)).foregroundColor(Theme.fg)
                    Text("这里还什么都没有").font(.system(size: 13)).foregroundColor(Theme.fgWeak)
                }
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("\(title)  ·  \(items.count) 部 · 下拉刷新")
                            .font(.system(size: 22, weight: .bold))
                            .foregroundColor(Theme.fg)

                        LazyVGrid(
                            columns: [GridItem(.adaptive(minimum: 100, maximum: 150), spacing: 12)],
                            spacing: 14
                        ) {
                            ForEach(items) { c in
                                PosterCard(card: c, fixedWidth: nil) { pick = c }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 24)
                }
                .refreshable { await load() }
            }
        }
        .task { if items.isEmpty { await load() } }
        .fullScreenCover(item: $pick) { c in DetailView(card: c) }
    }

    private func load() async {
        loading = true
        err = ""
        do {
            let list = try await loader()
            await MainActor.run { items = list; loading = false }
        } catch {
            await MainActor.run {
                err = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                loading = false
            }
        }
    }
}

// 直播：分组 + 频道网格，点开直接 AVPlayer 播
struct LiveView: View {
    @State private var resp: IptvResp?
    @State private var group = "全部"
    @State private var loading = true
    @State private var err = ""
    @State private var playing: IptvCh?
    @State private var playName = ""

    private var groups: [String] {
        var seen: [String] = ["全部"]
        for c in resp?.channels ?? [] {
            if let g = c.group, !g.isEmpty, !seen.contains(g) { seen.append(g) }
        }
        return seen
    }

    private var shown: [IptvCh] {
        let all = resp?.channels ?? []
        if group == "全部" { return all }
        return all.filter { ($0.group ?? "") == group }
    }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            if loading {
                ProgressView().tint(Theme.accentSoft)
            } else if let e = resp?.error, !e.isEmpty {
                Text(e).font(.system(size: 13)).foregroundColor(Theme.fgWeak)
            } else if !err.isEmpty {
                Text(err).font(.system(size: 13)).foregroundColor(Theme.fgWeak)
            } else if resp?.enabled == false {
                VStack(spacing: 8) {
                    Text("直播").font(.system(size: 20, weight: .bold)).foregroundColor(Theme.fg)
                    Text("站点后台没开直播功能").font(.system(size: 13)).foregroundColor(Theme.fgWeak)
                }
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Text("直播  ·  \(shown.count) 个频道")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(Theme.fg)
                        .padding(.horizontal, 20)
                        .padding(.top, 4)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(groups, id: \.self) { g in
                                FilterChip(text: g, on: g == group) { group = g }
                            }
                        }
                        .padding(.horizontal, 20)
                    }

                    ScrollView {
                        LazyVGrid(
                            columns: [GridItem(.adaptive(minimum: 150, maximum: 220), spacing: 10)],
                            spacing: 10
                        ) {
                            ForEach(shown) { ch in
                                Button {
                                    playName = ch.name ?? ""
                                    playing = ch
                                } label: {
                                    HStack(spacing: 10) {
                                        AsyncImage(url: Api.posterURL(ch.logo)) { phase in
                                            if let img = phase.image {
                                                img.resizable().scaledToFit()
                                            } else {
                                                RoundedRectangle(cornerRadius: 6)
                                                    .fill(Color.white.opacity(0.06))
                                                    .overlay(
                                                        Image(systemName: "tv")
                                                            .font(.system(size: 14))
                                                            .foregroundColor(Theme.fgWeak)
                                                    )
                                            }
                                        }
                                        .frame(width: 34, height: 34)
                                        .clipShape(RoundedRectangle(cornerRadius: 6))

                                        Text(ch.name ?? "-")
                                            .font(.system(size: 13))
                                            .foregroundColor(Theme.fg)
                                            .lineLimit(1)

                                        Spacer(minLength: 0)
                                    }
                                    .padding(.horizontal, 12)
                                    .frame(height: 54)
                                    .frame(maxWidth: .infinity)
                                    .cardBg(radius: 12)
                                }
                                .buttonStyle(PressScaleStyle())
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 20)
                    }
                }
            }
        }
        .task { if resp == nil { await load() } }
        .fullScreenCover(item: $playing) { ch in
            PlayerView(url: ch.src ?? "", title: playName,
                       useAuth: !(ch.cid?.value ?? "").isEmpty,
                       streamCid: ch.cid?.value ?? "",
                       streamDirect: ch.direct ?? false,
                       streamTitle: playName)
        }
    }

    private func load() async {
        loading = true
        err = ""
        do {
            let r = try await Api.iptv()
            await MainActor.run { resp = r; loading = false }
        } catch {
            await MainActor.run {
                err = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                loading = false
            }
        }
    }
}
