import SwiftUI
import AVKit

struct DetailView: View {
    let card: Card
    @Environment(\.dismiss) private var dismiss

    @State private var lines: [Line] = []
    @State private var detail: Detail?
    @State private var lineIdx = 0
    @State private var loading = true
    @State private var err = ""
    @State private var playing: Episode?
    @State private var playTitle = ""
    @State private var faved = false
    @State private var favBusy = false

    struct Line: Identifiable {
        let id = UUID()
        let station: String
        let from: String
        let eps: [Episode]
    }

    private var curLine: Line? { lines.indices.contains(lineIdx) ? lines[lineIdx] : nil }

    var body: some View {
        ZStack(alignment: .top) {
            backdrop
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    topGap
                    headBlock
                    lineBlock
                    plotBlock
                    episodeBlock
                }
                .padding(.bottom, 40)
            }
            closeButton
        }
        .background(Theme.bg.ignoresSafeArea())
        .task {
            await load()
            if let list = try? await Api.favs() {
                await MainActor.run { faved = list.contains { $0.idKey == card.idKey } }
            }
        }
        .fullScreenCover(item: $playing) { ep in
            PlayerView(url: ep.url ?? "", title: playTitle,
                       histId: card.idKey, histTitle: card.title ?? "",
                       histPoster: card.posterPath ?? "", histYear: card.year?.value ?? "",
                       epName: ep.name ?? "")
        }
    }

    private var backdrop: some View {
        GeometryReader { g in
            ZStack {
                AsyncImage(url: Api.posterURL(card.posterPath)) { phase in
                    if let img = phase.image {
                        img.resizable().aspectRatio(contentMode: .fill)
                    } else {
                        Theme.bg
                    }
                }
                .frame(width: g.size.width, height: g.size.height)
                .clipped()
                .blur(radius: 22)
                .overlay(Color(hex: 0x05060A).opacity(0.88))

                LinearGradient(
                    colors: [.clear, Theme.bg],
                    startPoint: .center, endPoint: .bottom
                )
            }
        }
        .ignoresSafeArea()
    }

    private var topGap: some View { Color.clear.frame(height: 54) }

    private var closeButton: some View {
        HStack {
            Button {
                dismiss()
            } label: {
                Text("‹ 返回")
                    .font(.system(size: 14))
                    .foregroundColor(Theme.fg)
                    .padding(.horizontal, 16)
                    .frame(height: 38)
                    .glassPill()
            }
            .buttonStyle(.plain)
            Spacer()
        }
        .padding(.horizontal, 22)
        .padding(.top, 12)
    }

    private var headBlock: some View {
        HStack(alignment: .top, spacing: 20) {
            AsyncImage(url: Api.posterURL(card.posterPath)) { phase in
                if let img = phase.image {
                    img.resizable().aspectRatio(contentMode: .fill)
                } else {
                    Theme.card
                }
            }
            .frame(width: 134, height: 198)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 10) {
                Text(card.title ?? "")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundColor(Theme.fg)
                    .lineLimit(3)

                Text(metaLine)
                    .font(.system(size: 13))
                    .foregroundColor(Theme.fgDim)
                    .lineLimit(2)

                HStack(spacing: 10) {
                    Button {
                        playFirst()
                    } label: {
                        Text("▶  立即播放")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                            .background(Capsule().fill(Theme.grad))
                    }
                    .buttonStyle(.plain)
                    .disabled(curLine == nil)
                    .opacity(curLine == nil ? 0.5 : 1)

                    Button {
                        toggleFav()
                    } label: {
                        Text(faved ? "★ 已收藏" : "☆ 收藏")
                            .font(.system(size: 14))
                            .foregroundColor(faved ? Theme.accentSoft : Theme.fg)
                            .frame(width: 96, height: 48)
                            .glassPill()
                    }
                    .buttonStyle(.plain)
                    .disabled(favBusy)
                }
                .padding(.top, 4)
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 22)
    }

    private var metaLine: String {
        var bits: [String] = []
        if let y = card.year?.value, !y.isEmpty { bits.append(y) }
        if let t = detail?.type, !t.isEmpty { bits.append(t) }
        if let a = detail?.area, !a.isEmpty { bits.append(a) }
        if let r = card.scoreText.isEmpty ? nil : card.scoreText { bits.append(r + " 分") }
        return bits.joined(separator: " · ")
    }

    private var lineBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text("线路").font(.system(size: 17, weight: .bold)).foregroundColor(Theme.fg)
                if loading { ProgressView().scaleEffect(0.6).tint(Theme.accentSoft) }
                Spacer()
                Text("共 \(lines.count) 条").font(.system(size: 12)).foregroundColor(Theme.fgWeak)
            }

            if !err.isEmpty {
                Text(err).font(.system(size: 12)).foregroundColor(Theme.fgWeak)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { i, l in
                        FilterChip(text: "\(l.station) · \(l.from)", on: i == lineIdx) {
                            lineIdx = i
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 18)
    }

    private var plotBlock: some View {
        Group {
            if let p = detail?.plot, !p.isEmpty {
                Text(p)
                    .font(.system(size: 13))
                    .foregroundColor(Theme.fgDim)
                    .lineSpacing(4)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color.white.opacity(0.05))
                    )
                    .padding(.horizontal, 24)
                    .padding(.bottom, 18)
            }
        }
    }

    private var episodeBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("选集（共 \(curLine?.eps.count ?? 0) 集）")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(Theme.fg)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 8), spacing: 8) {
                ForEach(Array((curLine?.eps ?? []).enumerated()), id: \.offset) { _, ep in
                    Button {
                        playTitle = "\(card.title ?? "") · \(ep.name ?? "")"
                        playing = ep
                    } label: {
                        Text(ep.name ?? "-")
                            .font(.system(size: 12))
                            .foregroundColor(Theme.fgDim)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity)
                            .frame(height: 34)
                            .background(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(Color.white.opacity(0.06))
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 24)
    }

    // MARK: 加载
    private func load() async {
        loading = true
        err = ""
        do {
            let r = try await Api.play(name: card.title ?? "", year: card.year?.value ?? "")
            let results = r.results ?? []
            var byKey: [String: Line] = [:]
            var order: [String] = []
            for res in results {
                let station = res.station ?? "采集"
                for s in res.sources ?? [] {
                    let eps = (s.episodes ?? []).filter { !($0.url ?? "").isEmpty }
                    if eps.isEmpty { continue }
                    let from = s.from ?? "线路"
                    let key = station + "|" + from
                    if let old = byKey[key] {
                        if eps.count > old.eps.count {
                            byKey[key] = Line(station: station, from: from, eps: eps)
                        }
                    } else {
                        byKey[key] = Line(station: station, from: from, eps: eps)
                        order.append(key)
                    }
                }
            }
            let built = order.compactMap { byKey[$0] }
            let d = results.first(where: { $0.detail != nil })?.detail

            await MainActor.run {
                lines = built
                detail = d
                loading = false
                if built.isEmpty {
                    err = "这部片暂时取不到线路，可能站方接口在抽风"
                }
            }
        } catch {
            await MainActor.run {
                err = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                loading = false
            }
        }
    }

    private func toggleFav() {
        favBusy = true
        Task {
            let on = try? await Api.toggleFav(card)
            await MainActor.run {
                favBusy = false
                if let v = on { faved = v }
            }
        }
    }

    private func playFirst() {
        guard let l = curLine, let first = l.eps.first else { return }
        playTitle = "\(card.title ?? "") · \(first.name ?? "")"
        playing = first
    }
}

// 播放器：AVPlayer，点上/下区域切显隐
struct PlayerView: View {
    let url: String
    let title: String
    var histId: String = ""
    var histTitle: String = ""
    var histPoster: String = ""
    var histYear: String = ""
    var epName: String = ""

    @Environment(\.dismiss) private var dismiss

    @State private var player: AVPlayer?
    @State private var showBar = true

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let p = player {
                VideoPlayer(player: p)
                    .ignoresSafeArea()
            } else {
                VStack(spacing: 8) {
                    Text("这条线路的地址不是标准视频流")
                        .font(.system(size: 14)).foregroundColor(.white)
                    Text("iOS 版暂不支持网页解析线路，换一条 m3u8 线路试试")
                        .font(.system(size: 12)).foregroundColor(.white.opacity(0.6))
                }
            }

            if showBar {
                VStack {
                    HStack(spacing: 10) {
                        Button { dismiss() } label: {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundColor(.white)
                                .frame(width: 40, height: 40)
                                .background(Circle().fill(Color.white.opacity(0.14)))
                        }
                        .buttonStyle(.plain)

                        Text(title)
                            .font(.system(size: 14))
                            .foregroundColor(.white)
                            .lineLimit(1)
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
                    Spacer()
                }
                .background(
                    LinearGradient(colors: [.black.opacity(0.7), .clear],
                                   startPoint: .top, endPoint: .bottom)
                        .frame(height: 110)
                        .frame(maxHeight: .infinity, alignment: .top)
                        .allowsHitTesting(false)
                )
            }
        }
        .onTapGesture { showBar.toggle() }
        .onAppear {
            start()
            // 进播放器就记一条历史，退出时再补进度
            report(pos: 0, dur: 0)
        }
        .onDisappear {
            let t = player?.currentTime().seconds ?? 0
            let d = player?.currentItem?.duration.seconds ?? 0
            player?.pause()
            report(pos: t.isFinite ? Int(t) : 0, dur: d.isFinite ? Int(d) : 0)
        }
        .statusBar(hidden: true)
    }

    private func report(pos: Int, dur: Int) {
        guard !histId.isEmpty else { return }
        Api.postHistory(id: histId, title: histTitle, poster: histPoster, year: histYear,
                        ep: epName, pos: "\(pos)", dur: "\(dur)")
    }

    private func start() {
        guard let u = URL(string: url) else { return }
        let p = AVPlayer(url: u)
        player = p
        p.play()
    }
}
