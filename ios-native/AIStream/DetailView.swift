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
    @State private var followed = false
    @State private var speeds: [Int: Int] = [:]      // 线路下标 → 毫秒
    @State private var testing = false
    @State private var speedInfo = ""

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
            await MainActor.run { followed = Prefs.shared.isFollowed(id: card.idKey) }
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
                            .frame(width: 88, height: 48)
                            .glassPill()
                    }
                    .buttonStyle(.plain)
                    .disabled(favBusy)

                    Button {
                        toggleFollow()
                    } label: {
                        Text(followed ? "✓ 已追剧" : "＋ 追剧")
                            .font(.system(size: 14))
                            .foregroundColor(followed ? Theme.accentSoft : Theme.fg)
                            .frame(width: 88, height: 48)
                            .glassPill()
                    }
                    .buttonStyle(.plain)
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
                Button {
                    runSpeedTest()
                } label: {
                    HStack(spacing: 4) {
                        if testing {
                            ProgressView().scaleEffect(0.5).tint(Theme.accentSoft)
                        } else {
                            Image(systemName: "bolt.fill").font(.system(size: 11))
                        }
                        Text(testing ? "测速中" : "一键测速").font(.system(size: 12))
                    }
                    .foregroundColor(Theme.accentSoft)
                    .padding(.horizontal, 10).frame(height: 28)
                    .background(Capsule().fill(Theme.accentSoft.opacity(0.12)))
                }
                .buttonStyle(.plain)
                .disabled(testing || lines.count < 2)
            }
            if !speedInfo.isEmpty {
                Text(speedInfo).font(.system(size: 11)).foregroundColor(Theme.accentSoft)
            }

            if !err.isEmpty {
                Text(err).font(.system(size: 12)).foregroundColor(Theme.fgWeak)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { i, l in
                        FilterChip(text: lineChipText(i, l), on: i == lineIdx) {
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

            /* 自适应列数：每格至少 56pt，保证"第01集"这类集名完整显示。
               之前写死 8 列，iPhone 竖屏每列才 38pt，文字被截成"第..."。 */
            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 56, maximum: 90), spacing: 8)],
                spacing: 8
            ) {
                ForEach(Array((curLine?.eps ?? []).enumerated()), id: \.offset) { idx, ep in
                    Button {
                        playTitle = "\(card.title ?? "") · \(ep.name ?? "")"
                        playing = ep
                    } label: {
                        Text(ep.name?.isEmpty == false ? ep.name! : "第\(idx + 1)集")
                            .font(.system(size: 12))
                            .foregroundColor(Theme.fgDim)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .frame(maxWidth: .infinity)
                            .frame(height: 36)
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
            // 直链（m3u8/mp4）排前面，网页解析线路排后面 —— iOS 只能播直链，
            // 用户默认点到第一条就是能播的，不会一进来就黑屏
            let built = order.compactMap { byKey[$0] }.sorted { a, b in
                DetailView.isDirect(a.eps.first?.url ?? "") && !DetailView.isDirect(b.eps.first?.url ?? "")
            }
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

    private func toggleFollow() {
        if followed {
            Prefs.shared.removeFollow(id: card.idKey)
        } else {
            Prefs.shared.addFollow(FollowItem(
                id: card.idKey, title: card.title ?? "", poster: card.posterPath ?? "",
                year: card.year?.value ?? "", lastEp: "", addAt: Date().timeIntervalSince1970))
        }
        followed.toggle()
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

    private func lineChipText(_ i: Int, _ l: Line) -> String {
        let base = DetailView.isDirect(l.eps.first?.url ?? "")
            ? "\(l.station) · \(l.from)"
            : "\(l.station) · \(l.from)(需解析)"
        if let ms = speeds[i] {
            return base + " · " + LineSpeed.shared.text(ms)
        }
        return base
    }

    private func runSpeedTest() {
        guard lines.count >= 2 else { return }
        testing = true
        speedInfo = "正在并发探测 \(lines.count) 条线路…"
        let inputs = lines.map { $0.eps.map { $0.url ?? "" } }
        Task {
            let result = await LineSpeed.shared.testAll(inputs)
            let best = result.filter { $0.value < LineSpeed.fail }.min { $0.value < $1.value }
            await MainActor.run {
                speeds = result
                testing = false
                if let b = best {
                    lineIdx = b.key
                    speedInfo = "最快：\(lines[b.key].station) · \(lines[b.key].from) · \(LineSpeed.shared.text(b.value))（已选中）"
                } else {
                    speedInfo = "所有线路都超时，检查网络"
                }
            }
        }
    }

    static func isDirect(_ url: String) -> Bool {
        let u = url.lowercased()
        return u.contains(".m3u8") || u.contains(".mp4") || u.hasSuffix(".ts")
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
    var useAuth: Bool = false        // 直播：URL 需要带 token
    var streamCid: String = ""       // 直播频道 cid

    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    @State private var player: AVPlayer?
    @State private var showBar = true
    @State private var hideWork: DispatchWorkItem?
    @State private var isPlaying = true
    @State private var playFailed = false
    @State private var statusObserver: NSObjectProtocol?
    // 进度条
    @State private var progress: Double = 0
    @State private var duration: Double = 0
    @State private var timeObserver: Any?
    @State private var seeking = false
    // 画中画
    @ObservedObject private var pip = PipManager.shared

    // 缩放 4 档（全屏也是缩放的一种）：0=适应 1=拉伸 2=裁剪 3=全屏(裁剪+隐藏UI)
    @State private var scaleIdx = 0
    private let scaleNames = ["适应", "拉伸", "裁剪", "全屏"]

    // 快进快退提示（">> 10s" / "<< 10s"），操作后短暂浮现
    @State private var seekHint = ""
    @State private var hintWork: DispatchWorkItem?

    // 弹窗菜单：倍速 / 缩放 / 线路信息
    @State private var showMenu = false
    @State private var speed: Float = 1.0

    // 手势起点：区分左右半屏的按压快进快退
    @State private var pressSide = 0   // -1 左（快退） 1 右（快进）

    var body: some View {
        /* 用两层 ZStack 各自顶部/底部对齐：返回栏和工具栏只占自身高度，
           中间视频区完全暴露给手势 —— 不再用铺满全屏的 VStack + Spacer，
           那会拦截触摸导致"点屏幕没反应、返回按钮点不到"。 */
        ZStack(alignment: .bottom) {
            ZStack(alignment: .top) {
                Color.black.ignoresSafeArea()

                if let p = player, !playFailed {
                    PlayerLayerView(
                        player: p,
                        scaleIdx: $scaleIdx,
                        onTap: { toggleBar() },
                        onPressBegin: { x in
                            if pressSide == 0 { beginPress(at: x) }
                        },
                        onPressEnd: { endPress() },
                        onCancelPress: { cancelPress() },
                        onPinch: { value in
                            // 双指撑开 → 裁剪→全屏；捏合 → 退回适应
                            if value > 1.25 {
                                zoomIn()
                            } else if value < 0.8 {
                                scaleIdx = 0
                                exitImmersiveIfNeeded()
                            }
                        }
                    )
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                } else {
                    VStack(spacing: 8) {
                        Image(systemName: "play.slash").font(.system(size: 34)).foregroundColor(.white.opacity(0.5))
                        Text(playFailed ? "这条线路播不了，换一条 m3u8 直链" : "正在加载…")
                            .font(.system(size: 14)).foregroundColor(.white)
                        if playFailed {
                            Text("返回上一页换线路，网页解析线路 iOS 不支持")
                                .font(.system(size: 12)).foregroundColor(.white.opacity(0.6))
                        }
                    }
                }

                // 顶部渐变：纯装饰，不拦触摸
                if showBar {
                    LinearGradient(
                        stops: [
                            .init(color: .black.opacity(0.85), location: 0),
                            .init(color: .black.opacity(0.45), location: 0.45),
                            .init(color: .black.opacity(0), location: 1)
                        ],
                        startPoint: .top, endPoint: .bottom
                    )
                    .frame(height: 170)
                    .allowsHitTesting(false)
                }

                // 返回按钮跟随控制层一起隐藏；点屏幕任意处唤出
                if showBar {
                    HStack(spacing: 10) {
                        Button { dismiss() } label: {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundColor(.white)
                                .frame(width: 44, height: 44)
                                .background(Circle().fill(Color.black.opacity(0.35)))
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
                }

                // 画中画诊断提示（失败时告诉用户原因）
                if !pip.diag.isEmpty {
                    Text(pip.diag)
                        .font(.system(size: 11))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12).frame(height: 30)
                        .background(Capsule().fill(Color.red.opacity(0.55)))
                        .padding(.top, 60)
                        .allowsHitTesting(false)
                }

                // 快进快退提示
                if !seekHint.isEmpty {
                    Text(seekHint)
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.white)
                        .shadow(radius: 8)
                        .transition(.scale.combined(with: .opacity))
                        .allowsHitTesting(false)
                }

                if showMenu {
                    Color.black.opacity(0.5)
                        .onTapGesture { showMenu = false }
                    menuPanel
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }

            // 底部：进度条 + 工具栏
            if showBar {
                VStack(spacing: 10) {
                    // 进度条：可拖动跳转，显示当前/总时长
                    VStack(spacing: 6) {
                        // 自定义进度条：点/拖任意位置都能跳转
                        GeometryReader { geo in
                            let ratio = duration > 0 ? min(1, max(0, progress / duration)) : 0
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.white.opacity(0.25)).frame(height: 5)
                                Capsule().fill(Theme.accentSoft)
                                    .frame(width: max(0, geo.size.width * CGFloat(ratio)), height: 5)
                                Circle().fill(.white).frame(width: 12, height: 12)
                                    .offset(x: max(0, geo.size.width * CGFloat(ratio) - 6))
                            }
                            .contentShape(Rectangle())
                            .gesture(
                                DragGesture(minimumDistance: 0)
                                    .onChanged { g in
                                        seeking = true
                                        let r = min(1, max(0, g.location.x / geo.size.width))
                                        progress = Double(r) * duration
                                    }
                                    .onEnded { g in
                                        let r = min(1, max(0, g.location.x / geo.size.width))
                                        let t = Double(r) * duration
                                        progress = t
                                        seek(to: t)
                                        seeking = false
                                        scheduleHide()
                                    }
                            )
                        }
                        .frame(height: 16)

                        HStack {
                            Text(fmtTime(progress)).font(.system(size: 10)).foregroundColor(.white.opacity(0.7))
                            Spacer()
                            Text(fmtTime(duration)).font(.system(size: 10)).foregroundColor(.white.opacity(0.7))
                        }
                    }
                    .padding(.horizontal, 24)

                    HStack(spacing: 20) {
                        barButton("gobackward.10", "快退") { nudge(-10) }
                        barButton(isPlaying ? "pause.fill" : "play.fill", "") { togglePlay() }
                        barButton("goforward.10", "快进") { nudge(10) }
                        barButton("slider.horizontal.3", "设置") { showMenu = true }
                        barButton("rectangle.on.rectangle", "画中画") { pip.toggle() }
                        barButton(scaleIdx == 3 ? "rectangle" : "rectangle.fill", "全屏") { toggleFullscreen() }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(Color.black.opacity(0.45)))
                }
                .padding(.bottom, 20)
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.18), value: showBar)
        .animation(.easeOut(duration: 0.2), value: showMenu)
        .onAppear { start(); scheduleHide() }
        .onDisappear {
            hideWork?.cancel()
            stopSeek()
            if let t = timeObserver, let p = player { p.removeTimeObserver(t) }
            timeObserver = nil
            NotificationCenter.default.removeObserver(self)
            let t = player?.currentTime().seconds ?? 0
            let d = player?.currentItem?.duration.seconds ?? 0
            player?.pause()
            report(pos: t.isFinite ? t : 0, dur: d.isFinite ? d : 0)
        }
        .statusBar(hidden: true)
        .hideSystemOverlays()
        .onChange(of: scenePhase) { phase in
            guard let p = player else { return }
            // 切后台不主动暂停：PiP 激活时视频要继续播；没 PiP 时系统会自己挂起。
            // 回前台时如果用户没主动暂停过，自动恢复播放。
            if phase == .active && isPlaying {
                p.play()
            }
        }
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

    private func speedChip(_ sp: Double) -> some View {
        Button {
            speed = Float(sp)
            player?.rate = Float(sp)
        } label: {
            Text(sp == 1.0 ? "1x" : "\(sp)x")
                .font(.system(size: 12))
                .foregroundColor(speed == Float(sp) ? .white : .white.opacity(0.5))
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(Capsule().fill(speed == Float(sp) ? Color.purple.opacity(0.8) : Color.white.opacity(0.08)))
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
            if i == 3 { showBar = false; hideWork?.cancel() }
            else { exitImmersiveIfNeeded() }
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
        // 直播走 /api/iptv/stream?ch=，必须带 token，否则 401
        let avItem: AVPlayerItem
        if useAuth, let req = Api.iptvStreamRequest(cid: streamCid), let u = req.url {
            // AVPlayerItem 没有 urlRequest 初始化器；用 AVURLAsset 的 options 带 token
            var opts: [String: Any] = ["AVURLAssetHTTPHeaderFieldsKey": req.allHTTPHeaderFields ?? [:]]
            opts["AVURLAssetAllowsCellularAccessKey"] = true
            let asset = AVURLAsset(url: u, options: opts)
            avItem = AVPlayerItem(asset: asset)
        } else {
            guard let u = URL(string: url) else { playFailed = true; return }
            avItem = AVPlayerItem(url: u)
        }
        let p = AVPlayer(playerItem: avItem)

        // 续播：本地有进度且没接近结尾就跳过去
        let saved = Prefs.shared.getProgress(histId, epName)
        if saved.dur > 0 && saved.pos > 10 && saved.pos < saved.dur - 15 {
            let t = CMTime(value: Int64(saved.pos), timescale: 1)
            p.seek(to: t)
        }

        // 观察播放状态：失败时给提示，不再干黑屏
        statusObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemFailedToPlayToEndTime, object: p.currentItem, queue: .main
        ) { _ in
            // PlayerView 是 struct，不能用 weak self；闭包里只改 @State，
            // 且 observer 会在 onDisappear 随 view 销毁，不会真的循环引用
            DispatchQueue.main.async { self.playFailed = true }
        }
        player = p
        p.rate = speed
        p.play()
        isPlaying = true
        playFailed = false

        // 进度观察：每 0.5 秒更新进度条（不拖动时）
        timeObserver = p.addPeriodicTimeObserver(
            forInterval: CMTime(value: 1, timescale: 2), queue: .main
        ) { time in
            if !self.seeking { self.progress = time.seconds }
            if let d = p.currentItem?.duration.seconds, d.isFinite { self.duration = d }
        }
        // 不要用 report(pos:0) 起步 —— 那会把刚读出来的续播进度覆盖成 0。
        // 历史记录进页面时写一条即可（保留原 pos），退出时再补真实进度。
        Api.postHistory(id: histId, title: histTitle, poster: histPoster, year: histYear,
                        ep: epName, pos: saved.pos, dur: saved.dur)
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

    // 捏合打断长按：只停定时器，不改显隐、不弹提示
    private func cancelPress() {
        seekTimer?.invalidate(); seekTimer = nil
        holdTimer?.invalidate(); holdTimer = nil
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


    private func fmtTime(_ sec: Double) -> String {
        guard sec.isFinite && sec > 0 else { return "0:00" }
        let m = Int(sec) / 60, s = Int(sec) % 60
        return String(format: "%d:%02d", m, s)
    }

    private func seek(to t: Double) {
        guard let p = player else { return }
        p.seek(to: CMTime(value: Int64(t), timescale: 1), toleranceBefore: .zero, toleranceAfter: .zero)
    }

    // 全屏 = 缩放第 4 档（裁剪铺满 + 隐藏 UI），不再用私有 API 改方向
    private func toggleFullscreen() {
        if scaleIdx == 3 { exitImmersiveIfNeeded(); scaleIdx = 0 }
        else { scaleIdx = 3; showBar = false; hideWork?.cancel() }
    }

    // 双指撑开：适应/拉伸 → 裁剪，裁剪 → 全屏
    private func zoomIn() {
        if scaleIdx < 2 { scaleIdx = 2 }
        else if scaleIdx == 2 { scaleIdx = 3; showBar = false; hideWork?.cancel() }
    }

    private func exitImmersiveIfNeeded() {
        if scaleIdx == 3 {
            showBar = true
            scheduleHide()
        }
    }

    private func report(pos: Double, dur: Double) {
        guard !histId.isEmpty else { return }
        Api.postHistory(id: histId, title: histTitle, poster: histPoster, year: histYear,
                        ep: epName, pos: pos, dur: dur)
    }
}

// 画中画管理器：全局单例持有 controller，SwiftUI 和 UIView 都能直接调用
final class PipManager: NSObject, ObservableObject {
    static let shared = PipManager()
    @Published var possible = false
    @Published var active = false
    @Published var diag = ""              // 诊断信息，让用户知道为什么不能画中画
    private var controller: AVPictureInPictureController?
    private weak var layer: AVPlayerLayer?
    private var waiting = false

    func attach(_ playerLayer: AVPlayerLayer) {
        layer = playerLayer
        diag = ""
        // 关键：必须等视频真正 ready 才能创建 PiP controller。
        // 过早创建（layer 还没 playerItem/没画面）会让 isPictureInPicturePossible 永久为 false。
        observeReady(playerLayer)
    }

    private func observeReady(_ playerLayer: AVPlayerLayer) {
        guard !waiting else { return }
        waiting = true
        // 轮询等 isReadyForDisplay —— 视频首帧出来才创建 controller
        checkReady(0, playerLayer)
    }

    private func checkReady(_ n: Int, _ playerLayer: AVPlayerLayer) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            guard let self = self else { return }
            if self.layer !== playerLayer { return }  // 换片源了
            if playerLayer.isReadyForDisplay {
                self.createController(playerLayer)
            } else if n < 40 {
                self.checkReady(n + 1, playerLayer)
            } else {
                self.diag = "视频没准备好，无法画中画"
            }
        }
    }

    private func createController(_ playerLayer: AVPlayerLayer) {
        guard AVPictureInPictureController.isPictureInPictureSupported() else {
            diag = "设备不支持画中画"
            return
        }
        // 换 layer 时重建
        if controller == nil {
            if let c = AVPictureInPictureController(playerLayer: playerLayer) {
                c.delegate = self
                controller = c
            }
        }
        possible = controller != nil
        // 再等 possible 变 true（视频起播后系统才允许）
        waitPossible(0)
    }

    private func waitPossible(_ n: Int) {
        guard n < 20, let c = controller else { return }
        if c.isPictureInPicturePossible {
            diag = ""
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                self.waitPossible(n + 1)
            }
        }
    }

    func toggle() {
        guard let c = controller else {
            diag = "画中画还没准备好，稍等几秒再点"
            return
        }
        if c.isPictureInPictureActive {
            c.stopPictureInPicture()
            return
        }
        // 不依赖 isPictureInPicturePossible（它对某些 m3u8 误判为 false）
        // 直接尝试启动，系统通过 delegate 回调告诉我们成败
        c.startPictureInPicture()
        diag = "正在启动画中画…"
    }

    private func retryStart(_ n: Int) {
        guard n < 15 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self = self, let c = self.controller else { return }
            if c.isPictureInPictureActive { return }
            if c.isPictureInPicturePossible {
                self.diag = ""
                c.startPictureInPicture()
            } else {
                self.retryStart(n + 1)
            }
        }
    }
}

extension PipManager: AVPictureInPictureControllerDelegate {
    func pictureInPictureControllerDidStartPictureInPicture(_ c: AVPictureInPictureController) {
        active = true
        diag = ""
    }
    func pictureInPictureControllerDidStopPictureInPicture(_ c: AVPictureInPictureController) {
        active = false
    }
    func pictureInPictureController(_ c: AVPictureInPictureController,
                                    failedToStartPictureInPictureWithError error: Error) {
        active = false
        diag = "画中画失败：\(error.localizedDescription)"
    }
}

/* 视频层：必须用自定义 UIView 子类重写 layoutSubviews 更新 AVPlayerLayer.frame。
   之前用 UIViewRepresentable 直接设 frame=v.bounds，makeUIView 时 bounds 还是 .zero，
   updateUIView 又只在绑定变化时调用，导致 layer 尺寸一直是 0 → 黑屏。 */
final class PlayerUIView: UIView {
    let playerLayer = AVPlayerLayer()
    var pip: AVPictureInPictureController?
    var gravity: AVLayerVideoGravity = .resizeAspect {
        didSet { playerLayer.videoGravity = gravity }
    }

    // 手势回调（由 SwiftUI 注入）
    var onTap: () -> Void = {}
    var onPressBegin: (CGFloat) -> Void = { _ in }
    var onPressEnd: () -> Void = {}
    var onCancelPress: () -> Void = {}     // 捏合打断长按：只停快进，不切显隐
    var onPinch: (CGFloat) -> Void = { _ in }

    // 手势识别器：捏合和长按互斥，杜绝双指撑开误触快进
    private var longPress: UILongPressGestureRecognizer?
    private var pinch: UIPinchGestureRecognizer?

    init(player: AVPlayer) {
        super.init(frame: .zero)
        backgroundColor = .black
        playerLayer.player = player
        playerLayer.videoGravity = .resizeAspect
        layer.addSublayer(playerLayer)
        isUserInteractionEnabled = true

        // 点按：切换控制层
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        tap.delegate = self
        addGestureRecognizer(tap)

        // 长按（单指）：快进/快退
        let lp = UILongPressGestureRecognizer(target: self, action: #selector(handleLongPress))
        lp.minimumPressDuration = 0.3
        lp.delegate = self
        longPress = lp
        addGestureRecognizer(lp)

        // 捏合（双指）：缩放。识别成功时强制让长按失败
        let pin = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch))
        pin.delegate = self
        pinch = pin
        addGestureRecognizer(pin)

        // 画中画：把 AVPlayerLayer 交给全局 PipManager 持有 controller
        PipManager.shared.attach(playerLayer)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    @objc private func handleTap() { onTap() }

    @objc private func handleLongPress(_ g: UILongPressGestureRecognizer) {
        // 双指正在捏合 → 忽略长按，避免误触快进
        if pinch?.state == .began || pinch?.state == .changed { return }
        switch g.state {
        case .began: onPressBegin(g.location(in: self).x)
        case .ended, .cancelled, .failed: onPressEnd()
        default: break
        }
    }

    @objc private func handlePinch(_ g: UIPinchGestureRecognizer) {
        // 捏合开始时，取消正在进行长按（触发快进的定时器）
        if g.state == .began { onCancelPress() }
        switch g.state {
        case .ended, .cancelled:
            onPinch(g.scale)
            g.scale = 1
        default: break
        }
    }

    override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        // 双指触摸时，长按和点按都不该开始
        if gestureRecognizer === longPress || gestureRecognizer is UITapGestureRecognizer {
            return pinch?.state != .began && pinch?.state != .changed
        }
        return true
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        playerLayer.frame = bounds
    }

}

struct PlayerLayerView: UIViewRepresentable {
    let player: AVPlayer
    @Binding var scaleIdx: Int
    // 由 SwiftUI 注入的手势回调（UIKit 原生手势保证双指/单指互斥）
    var onTap: () -> Void = {}
    var onPressBegin: (CGFloat) -> Void = { _ in }
    var onPressEnd: () -> Void = {}
    var onCancelPress: () -> Void = {}
    var onPinch: (CGFloat) -> Void = { _ in }

    func makeUIView(context: Context) -> PlayerUIView {
        let v = PlayerUIView(player: player)
        v.onTap = onTap
        v.onPressBegin = onPressBegin
        v.onPressEnd = onPressEnd
        v.onCancelPress = onCancelPress
        v.onPinch = onPinch
        return v
    }
    func updateUIView(_ v: PlayerUIView, context: Context) {
        v.gravity = gravity(scaleIdx)
        v.onTap = onTap
        v.onPressBegin = onPressBegin
        v.onPressEnd = onPressEnd
        v.onCancelPress = onCancelPress
        v.onPinch = onPinch
    }
    private func gravity(_ idx: Int) -> AVLayerVideoGravity {
        switch idx {
        case 1: return .resize
        case 2, 3: return .resizeAspectFill
        default: return .resizeAspect
        }
    }
}

// 手势互斥：双指捏合时禁用长按和点按，避免误触快进/显隐
extension PlayerUIView: UIGestureRecognizerDelegate {
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        // 捏合 与 长按/点按 不能同时识别
        if gestureRecognizer === pinch || other === pinch { return false }
        return true
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
