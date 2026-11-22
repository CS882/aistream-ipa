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

// 播放器：AVPlayer + 自定义控制层（自动隐藏 / 左右快进快退 / 缩放 / 弹窗 / 续播）
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
    @State private var hideWork: DispatchWorkItem?
    @State private var isPlaying = true

    // 缩放：0=适应 1=拉伸 2=裁剪铺满
    @State private var scaleIdx = 0
    private let scaleNames = ["适应", "拉伸", "裁剪"]

    // 快进快退提示（">> 10s" / "<< 10s"），操作后短暂浮现
    @State private var seekHint = ""
    @State private var hintWork: DispatchWorkItem?

    // 弹窗菜单：倍速 / 缩放 / 线路信息
    @State private var showMenu = false
    @State private var speed: Float = 1.0

    // 手势起点：区分左右半屏的按压快进快退
    @State private var pressSide = 0   // -1 左（快退） 1 右（快进）

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let p = player {
                PlayerLayerView(player: p, scaleIdx: $scaleIdx)
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    // 左右半屏按压：按住持续快进/快退，松开恢复
                    .simultaneousGesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { v in
                                if pressSide == 0 { beginPress(at: v.startLocation.x) }
                            }
                            .onEnded { _ in endPress() }
                    )
            } else {
                VStack(spacing: 8) {
                    Text("这条线路的地址不是标准视频流")
                        .font(.system(size: 14)).foregroundColor(.white)
                    Text("iOS 版暂不支持网页解析线路，换一条 m3u8 线路试试")
                        .font(.system(size: 12)).foregroundColor(.white.opacity(0.6))
                }
            }

            // 快进快退提示浮层
            if !seekHint.isEmpty {
                Text(seekHint)
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(.white)
                    .shadow(radius: 8)
                    .transition(.scale.combined(with: .opacity))
                    .allowsHitTesting(false)
            }

            if showBar {
                controlLayer
                    .transition(.opacity)
            }

            if showMenu {
                Color.black.opacity(0.5)
                    .ignoresSafeArea()
                    .onTapGesture { showMenu = false }
                menuPanel
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.18), value: showBar)
        .animation(.easeOut(duration: 0.2), value: showMenu)
        .onAppear {
            start()
            scheduleHide()
        }
        .onDisappear {
            hideWork?.cancel()
            stopSeek()
            let t = player?.currentTime().seconds ?? 0
            let d = player?.currentItem?.duration.seconds ?? 0
            player?.pause()
            report(pos: t.isFinite ? t : 0, dur: d.isFinite ? d : 0)
        }
        .statusBar(hidden: true)
        .hideSystemOverlays()   // 隐藏 Home Indicator，达成全屏
    }

    // MARK: 控制层（顶部渐变 + 标题 + 底部按钮）
    private var controlLayer: some View {
        VStack {
            // 顶部：加高到 170pt + 三段渐变，避免之前 110pt 的硬边
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Button { dismiss() } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(width: 40, height: 40)
                            .background(Circle().fill(Color.white.opacity(0.14)))
                    }
                    .buttonStyle(.plain)
                    .allowsHitTesting(true)

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
            .frame(height: 170)
            .allowsHitTesting(false)   // 顶部渐变区不拦触摸，让视频区手势能穿透
            .background(
                LinearGradient(
                    stops: [
                        .init(color: .black.opacity(0.85), location: 0),
                        .init(color: .black.opacity(0.45), location: 0.45),
                        .init(color: .black.opacity(0), location: 1)
                    ],
                    startPoint: .top, endPoint: .bottom
                )
            )
            .allowsHitTesting(true)

            Spacer()

            // 底部工具栏
            HStack(spacing: 22) {
                barButton("gobackward.10", "快退") { nudge(-10) }
                barButton(isPlaying ? "pause.fill" : "play.fill", "") { togglePlay() }
                barButton("goforward.10", "快进") { nudge(10) }
                barButton("slider.horizontal.3", "设置") { showMenu = true }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(Capsule().fill(Color.black.opacity(0.45)))
            .padding(.bottom, 24)
        }
        .allowsHitTesting(false)   // 只让里面的按钮响应，空白处手势穿透到视频
    }

    private func barButton(_ icon: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundColor(.white)
                if !label.isEmpty {
                    Text(label).font(.system(size: 9)).foregroundColor(.white.opacity(0.7))
                }
            }
            .frame(minWidth: 36, minHeight: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .allowsHitTesting(true)
    }

    // MARK: 弹窗菜单（拆成小视图，避免编译器类型检查超时）
    private var menuPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("播放设置")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)
                .padding(.bottom, 12)

            speedRow
            scaleRow

            Button { showMenu = false } label: {
                Text("完成")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 40)
                    .background(Capsule().fill(Color.purple.opacity(0.85)))
            }
            .buttonStyle(.plain)
            .padding(.top, 16)
        }
        .padding(20)
        .background(RoundedRectangle(cornerRadius: 20).fill(Color(hex: 0x15151C)))
        .padding(.horizontal, 30)
    }

    private var speedRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("倍速")
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.6))
            HStack(spacing: 6) {
                ForEach([0.75, 1.0, 1.25, 1.5, 2.0], id: \.self) { sp in
                    speedChip(sp)
                }
            }
        }
        .padding(.vertical, 8)
    }

    private func speedChip(_ sp: Float) -> some View {
        Button {
            speed = sp
            player?.rate = sp
        } label: {
            Text(sp == 1.0 ? "1x" : "\(sp)x")
                .font(.system(size: 12))
                .foregroundColor(speed == sp ? .white : .white.opacity(0.5))
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(Capsule().fill(speed == sp ? Color.purple.opacity(0.8) : Color.white.opacity(0.08)))
        }
        .buttonStyle(.plain)
    }

    private var scaleRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("画面比例")
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.6))
            HStack(spacing: 6) {
                ForEach(0..<scaleNames.count, id: \.self) { i in
                    scaleChip(i)
                }
            }
        }
        .padding(.vertical, 8)
    }

    private func scaleChip(_ i: Int) -> some View {
        Button {
            scaleIdx = i
        } label: {
            Text(scaleNames[i])
                .font(.system(size: 12))
                .foregroundColor(scaleIdx == i ? .white : .white.opacity(0.5))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Capsule().fill(scaleIdx == i ? Color.purple.opacity(0.8) : Color.white.opacity(0.08)))
        }
        .buttonStyle(.plain)
    }

    // MARK: 播放控制
    private func start() {
        guard let u = URL(string: url) else { return }
        let p = AVPlayer(url: u)

        // 续播：本地有进度且没接近结尾就跳过去
        let saved = Prefs.shared.getProgress(histId, epName)
        if saved.dur > 0 && saved.pos > 10 && saved.pos < saved.dur - 15 {
            let t = CMTime(value: Int64(saved.pos), timescale: 1)
            p.seek(to: t)
        }

        player = p
        p.rate = speed
        p.play()
        isPlaying = true
        report(pos: 0, dur: 0)
    }

    private func togglePlay() {
        guard let p = player else { return }
        if isPlaying { p.pause() } else { p.play() }
        isPlaying.toggle()
        scheduleHide()
    }

    private func nudge(_ sec: Double) {
        guard let p = player else { return }
        let cur = p.currentTime().seconds
        let target = max(0, cur + sec)
        p.seek(to: CMTime(value: Int64(target), timescale: 1), toleranceBefore: .zero, toleranceAfter: .zero)
        showHint(sec > 0 ? "快进 +\(Int(sec))s" : "快退 \(Int(sec))s")
    }

    /* 左右半屏按压快进快退：
       - 按下 0.3s 内松开 → 当作单击，切换控制层显隐
       - 按住超过 0.3s → 启动连续 seek，左半屏快退、右半屏快进 */
    @State private var seekTimer: Timer?
    @State private var holdTimer: Timer?

    private func beginPress(at x: CGFloat) {
        pressSide = x < UIScreen.main.bounds.width / 2 ? -1 : 1
        holdTimer?.invalidate()
        let hold = DispatchWorkItem {
            DispatchQueue.main.async {
                self.nudge(Double(self.pressSide) * 5)
                self.seekTimer?.invalidate()
                self.seekTimer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
                    DispatchQueue.main.async { self.nudge(Double(self.pressSide) * 5) }
                }
            }
        }
        holdTimer = Timer.scheduledTimer(withTimeInterval: 0.3, repeats: false) { _ in
            DispatchQueue.main.async(execute: hold)
        }
    }

    private func endPress() {
        holdTimer?.invalidate()
        holdTimer = nil
        let wasSeeking = seekTimer != nil
        seekTimer?.invalidate()
        seekTimer = nil
        if wasSeeking {
            showHint(pressSide > 0 ? "快进完成" : "快退完成")
        } else {
            // 没触发长按 → 当作单击
            toggleBar()
        }
        pressSide = 0
    }

    private func stopSeek() {
        seekTimer?.invalidate(); seekTimer = nil
        holdTimer?.invalidate(); holdTimer = nil
    }

    private func showHint(_ s: String) {
        seekHint = s
        hintWork?.cancel()
        let w = DispatchWorkItem { seekHint = "" }
        hintWork = w
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0, execute: w)
    }

    private func toggleBar() {
        showBar.toggle()
        if showBar { scheduleHide() }
    }

    // 播放后自动隐藏工具栏（3 秒），替代原来"要等很久才消失"
    private func scheduleHide() {
        hideWork?.cancel()
        let w = DispatchWorkItem {
            withAnimation(.easeOut(duration: 0.2)) { showBar = false }
        }
        hideWork = w
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0, execute: w)
    }

    private func report(pos: Double, dur: Double) {
        guard !histId.isEmpty else { return }
        Api.postHistory(id: histId, title: histTitle, poster: histPoster, year: histYear,
                        ep: epName, pos: pos, dur: dur)
    }
}

// AVPlayerLayer 容器：通过 gravity 切换适应/拉伸/裁剪
struct PlayerLayerView: UIViewRepresentable {
    let player: AVPlayer
    @Binding var scaleIdx: Int

    func makeUIView(context: Context) -> UIView {
        let v = UIView()
        v.backgroundColor = .black
        let layer = AVPlayerLayer(player: player)
        layer.frame = v.bounds
        layer.videoGravity = gravity(0)
        v.layer.addSublayer(layer)
        return v
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        guard let layer = uiView.layer.sublayers?.first as? AVPlayerLayer else { return }
        layer.frame = uiView.bounds
        layer.videoGravity = gravity(scaleIdx)
    }

    private func gravity(_ idx: Int) -> AVLayerVideoGravity {
        switch idx {
        case 1: return .resize
        case 2: return .resizeAspectFill
        default: return .resizeAspect
        }
    }
}

extension View {
    /* iOS 16+ 用 persistentSystemOverlays 隐藏 Home Indicator；
       iOS 15 保持原样（系统不支持隐藏，只是那条细线还在）。 */
    @ViewBuilder
    func hideSystemOverlays() -> some View {
        if #available(iOS 16.0, *) {
            self.persistentSystemOverlays(.hidden)
        } else {
            self
        }
    }
}
