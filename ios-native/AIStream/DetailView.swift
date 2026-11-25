import SwiftUI
import AVKit
import MediaPlayer

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
        // 左滑返回：横向位移超过 100pt 且明显大于纵向位移才算，避免和竖向滚动/横向 chip 冲突
        .gesture(
            DragGesture(minimumDistance: 60)
                .onEnded { v in
                    let dx = v.translation.width
                    let dy = v.translation.height
                    if dx < -100 && abs(dx) > abs(dy) * 1.5 {
                        dismiss()
                    }
                }
        )
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
    @StateObject private var pip = PipManager()

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

    // 横滑快进快退（跟进度条一样：跟手预览，松手才真正跳）
    @State private var scrubActive = false
    @State private var scrubStart: Double = 0
    @State private var scrubTarget: Double = 0

    // 双击暂停 / 再次双击播放
    @State private var doubleHint = ""
    @State private var doubleHintWork: DispatchWorkItem?

    // 弹幕（本地发送，站点无弹幕接口）
    @StateObject private var danmaku = DanmakuStore()
    @State private var showDanmakuInput = false
    @State private var danmakuText = ""

    // 竖滑：左半屏亮度、右半屏音量
    @State private var hudVisible = false
    @State private var hudValue: Double = 0
    @State private var hudIsBrightness = true
    @State private var hudWork: DispatchWorkItem?
    @State private var adjustBase: Double = 0

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
                        onDoubleTap: { togglePlayByDoubleTap() },
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
                        },
                        onSwipeBack: {
                            cancelPress()   // 先停掉可能正在进行的快进
                            dismiss()
                        },
                        onSeekBegin: { scrubBegin() },
                        onSeekChange: { dx in scrubChange(dx) },
                        onSeekEnd: { cancelled in scrubEnd(cancelled) },
                        onAdjustBegin: { isLeft in adjustBegin(isLeft: isLeft) },
                        onAdjustChange: { dy in adjustChange(dy) },
                        onAdjustEnd: { adjustEnd() },
                        pip: pip
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

                // 弹幕层：只在开启时画，且不吃触摸（点击/手势仍透传给视频层）
                if danmaku.enabled {
                    DanmakuLayer(store: danmaku)
                        .ignoresSafeArea()
                }

                // 双击暂停/播放提示
                if !doubleHint.isEmpty {
                    Text(doubleHint)
                        .font(.system(size: 26, weight: .bold))
                        .foregroundColor(.white)
                        .shadow(radius: 8)
                        .allowsHitTesting(false)
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

                // 横滑进度 HUD：跟进度条一样显示"跳到哪 / 总时长"
                if scrubActive {
                    VStack(spacing: 4) {
                        Text(scrubDeltaText)
                            .font(.system(size: 26, weight: .bold))
                            .foregroundColor(.white)
                        Text("\(fmtTime(scrubTarget)) / \(fmtTime(duration))")
                            .font(.system(size: 12))
                            .foregroundColor(.white.opacity(0.75))
                    }
                    .padding(.horizontal, 22)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color.black.opacity(0.55))
                    )
                    .padding(.top, 130)
                    .allowsHitTesting(false)
                }

                // 亮度/音量 HUD
                if hudVisible {
                    VStack(spacing: 6) {
                        Image(systemName: hudIsBrightness ? "sun.max.fill" : "speaker.wave.2.fill")
                            .font(.system(size: 22))
                            .foregroundColor(.white)
                        ZStack(alignment: .leading) {
                            Capsule().fill(Color.white.opacity(0.25)).frame(width: 120, height: 4)
                            Capsule().fill(Color.white).frame(width: max(0, 120 * CGFloat(hudValue)), height: 4)
                        }
                        Text(hudTitle + " " + String(Int(hudValue * 100)) + "%")
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.8))
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color.black.opacity(0.55))
                    )
                    .padding(.top, 130)
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
                        // 弹幕开关：关时灰、开时亮
                        barButton(danmaku.enabled ? "bubble.left.and.bubble.right.fill"
                                                  : "bubble.left.and.bubble.right", "弹幕") {
                            danmaku.setEnabled(!danmaku.enabled)
                            showDanmakuInput = danmaku.enabled
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(Color.black.opacity(0.45)))

                    // 弹幕输入：点工具栏「弹幕」展开，回车即发
                    if danmaku.enabled && showDanmakuInput {
                        HStack(spacing: 8) {
                            TextField("发个弹幕…", text: $danmakuText)
                                .font(.system(size: 13))
                                .foregroundColor(.white)
                                .textFieldStyle(.plain)
                                .submitLabel(.send)
                                .onSubmit { sendDanmaku() }
                            Button { sendDanmaku() } label: {
                                Text("发送").font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 12).frame(height: 28)
                                    .background(Capsule().fill(Theme.accentSoft.opacity(0.85)))
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background(Capsule().fill(Color.black.opacity(0.45)))
                        .padding(.horizontal, 16)
                    }
                }
                .padding(.bottom, 20)
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.18), value: showBar)
        .animation(.easeOut(duration: 0.2), value: showMenu)
        .onAppear { start(); scheduleHide() }
        .onDisappear {
            // BUG 修复：所有延时任务与 token 观察器都要显式清理，
            // 否则换片后闭包仍持有旧 self、提示会串到下一部片
            hideWork?.cancel()
            hintWork?.cancel()
            hudWork?.cancel()
            doubleHintWork?.cancel()
            stopSeek()
            if let t = timeObserver, let p = player { p.removeTimeObserver(t) }
            timeObserver = nil
            if let o = statusObserver {
                NotificationCenter.default.removeObserver(o)
                statusObserver = nil
            }
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
        // BUG 修复：重复进入时先拆掉旧观察器/播放器，避免重复注册导致进度乱跳
        if let t = timeObserver, let old = player { old.removeTimeObserver(t) }
        timeObserver = nil
        if let o = statusObserver { NotificationCenter.default.removeObserver(o) }
        statusObserver = nil
        player?.pause()
        stopSeek()

        // PiP 硬性前置：先激活后台音频会话（Apple 文档要求）
        AudioSessionManager.activateForPlayback()
        _ = VolumeManager.shared      // 预热：让隐藏的 MPVolumeView 先进 window
        // 弹幕按片子+集数分别保存，换片不串
        danmaku.load(histId.isEmpty ? title : "\(histId)|\(epName)")
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
        /* 播放缓冲：提前缓存约 60 秒内容，弱网下减少卡顿。
           preferredForwardBufferDuration 是系统 HLS 播放的标准做法，
           不走自定义 resourceLoader，避免破坏直链与 PiP。 */
        avItem.preferredForwardBufferDuration = 60
        let p = AVPlayer(playerItem: avItem)
        p.automaticallyWaitsToMinimizeStalling = true

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

    // 双击画面：与单击显隐分开，单击是 tap、双击是 doubleTap（tap 需等 doubleTap 失败才触发）
    private func togglePlayByDoubleTap() {
        cancelPress()
        togglePlay()
        showDoubleHint(isPlaying ? "▶ 播放" : "⏸ 暂停")
    }

    private func showDoubleHint(_ s: String) {
        doubleHint = s
        doubleHintWork?.cancel()
        let w = DispatchWorkItem { doubleHint = "" }
        doubleHintWork = w
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7, execute: w)
    }

    private func sendDanmaku() {
        let t = danmakuText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        danmaku.send(t)
        danmakuText = ""
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


    // MARK: 横滑快进快退（跟进度条一样）
    /* 全屏宽度对应多少秒：短片子给 60s、长片子最多 240s，
       这样 10 分钟的短剧和 2.5 小时的电影都好用。 */
    private var scrubSpan: Double {
        guard duration > 0 else { return 90 }
        return max(60, min(240, duration * 0.06))
    }

    private var scrubDelta: Double { scrubTarget - scrubStart }

    private var hudTitle: String { hudIsBrightness ? "亮度" : "音量" }

    private var scrubDeltaText: String {
        let d = scrubDelta
        let sign = d >= 0 ? "+" : "-"
        let t = fmtTime(abs(d))
        return d == 0 ? "0:00" : "\(sign)\(t)"
    }

    private func scrubBegin() {
        cancelPress()                 // 停掉长按连跳，避免两套 seek 打架
        seekTimer?.invalidate(); seekTimer = nil
        hideWork?.cancel()            // 拖动期间别让控制层消失
        scrubActive = true
        scrubStart = progress
        scrubTarget = progress
        seeking = true                // 让时间观察器别覆盖我们设的 progress
    }

    private func scrubChange(_ ratio: CGFloat) {
        guard scrubActive else { return }
        let delta = Double(ratio) * scrubSpan
        let upper = duration > 0 ? duration : max(scrubStart + delta, 0)
        scrubTarget = max(0, min(upper, scrubStart + delta))
        progress = scrubTarget         // 进度条同步跟手
    }

    private func scrubEnd(_ cancelled: Bool) {
        guard scrubActive else { return }
        scrubActive = false
        seeking = false
        if !cancelled, scrubTarget != scrubStart {
            seek(to: scrubTarget)
        }
        progress = scrubTarget
        scheduleHide()
    }

    // MARK: 竖滑亮度 / 音量
    private func adjustBegin(isLeft: Bool) {
        cancelPress()
        hideWork?.cancel()
        hudIsBrightness = isLeft
        adjustBase = isLeft ? Double(UIScreen.main.brightness) : VolumeManager.shared.current
        hudValue = adjustBase
        hudVisible = true
    }

    private func adjustChange(_ ratio: CGFloat) {
        // 手指向上（ratio 为负）= 调大，整屏高度对应 100%
        let v = max(0, min(1, adjustBase - Double(ratio)))
        if hudIsBrightness {
            UIScreen.main.brightness = CGFloat(v)
        } else {
            VolumeManager.shared.set(v)
        }
        hudValue = v
        hudVisible = true
    }

    private func adjustEnd() {
        hudWork?.cancel()
        let w = DispatchWorkItem { hudVisible = false }
        hudWork = w
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7, execute: w)
        scheduleHide()
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
/* 画中画管理器：每个播放器持有一个独立实例（不再用单例）。
   单例会导致 controller 绑死在第一个 AVPlayerLayer 上，
   换片源后 isPictureInPicturePossible 永久 false —— "看过一次就再也打不开"。 */
final class PipManager: NSObject, ObservableObject {
    @Published var possible = false
    @Published var active = false
    @Published var diag = ""

    private var controller: AVPictureInPictureController?
    private weak var layer: AVPlayerLayer?
    private var readyKVO: NSKeyValueObservation?
    private var possibleKVO: NSKeyValueObservation?
    private var pending = false
    private var built = false

    /// 绑定视频层。可重复调用（updateUIView 会多次触发），幂等。
    func attach(_ playerLayer: AVPlayerLayer) {
        layer = playerLayer
        guard AVPictureInPictureController.isPictureInPictureSupported() else {
            diag = "设备不支持画中画"
            return
        }
        if !built {
            buildController(playerLayer)
        }
        if readyKVO == nil {
            readyKVO = playerLayer.observe(\.isReadyForDisplay, options: [.new]) { [weak self] _, ch in
                guard ch.newValue == true else { return }
                DispatchQueue.main.async { self?.flushPending() }
            }
        }
        if playerLayer.isReadyForDisplay { flushPending() }
    }

    private func buildController(_ playerLayer: AVPlayerLayer) {
        built = true
        // 延迟一轮 RunLoop：确保 layer 已加入 window，否则初始化直接返回 nil
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.controller == nil else { return }
            guard let c = AVPictureInPictureController(playerLayer: playerLayer) else {
                self.built = false      // 允许下次 attach 重试
                return
            }
            c.delegate = self
            self.controller = c
            self.possibleKVO = c.observe(\.isPictureInPicturePossible, options: [.initial, .new]) { [weak self] _, ch in
                DispatchQueue.main.async {
                    self?.possible = ch.newValue ?? false
                    if ch.newValue == true {
                        self?.diag = ""
                        self?.flushPending()
                    }
                }
            }
        }
    }

    private func flushPending() {
        guard pending, let c = controller,
              c.isPictureInPicturePossible, !c.isPictureInPictureActive else { return }
        pending = false
        c.startPictureInPicture()
    }

    func toggle() {
        // 没建好就现场补建（应对 attach 时机过早）
        if controller == nil, let l = layer { buildController(l) }
        guard let c = controller else {
            diag = "画中画初始化中，稍等再点"
            return
        }
        if c.isPictureInPictureActive {
            c.stopPictureInPicture()
            return
        }
        if c.isPictureInPicturePossible {
            diag = ""
            c.startPictureInPicture()
        } else {
            pending = true
            diag = "正在准备画中画…"
        }
    }

    deinit {
        readyKVO?.invalidate()
        possibleKVO?.invalidate()
        controller?.delegate = nil
    }
}

extension PipManager: AVPictureInPictureControllerDelegate {
    func pictureInPictureControllerDidStartPictureInPicture(_ c: AVPictureInPictureController) {
        active = true; pending = false; diag = ""
    }
    func pictureInPictureControllerDidStopPictureInPicture(_ c: AVPictureInPictureController) {
        active = false
    }
    func pictureInPictureController(_ c: AVPictureInPictureController,
                                    failedToStartPictureInPictureWithError error: Error) {
        active = false; pending = false
        diag = "画中画失败：\(error.localizedDescription)"
    }
}

/* 视频层：必须用自定义 UIView 子类重写 layoutSubviews 更新 AVPlayerLayer.frame。
   之前用 UIViewRepresentable 直接设 frame=v.bounds，makeUIView 时 bounds 还是 .zero，
   updateUIView 又只在绑定变化时调用，导致 layer 尺寸一直是 0 → 黑屏。 */
final class PlayerUIView: UIView {
    let playerLayer = AVPlayerLayer()
    var gravity: AVLayerVideoGravity = .resizeAspect {
        didSet { playerLayer.videoGravity = gravity }
    }

    weak var pipMgr: PipManager?       // 由 PlayerLayerView 注入的独立实例

    // 手势回调（由 SwiftUI 注入）
    var onTap: () -> Void = {}
    var onDoubleTap: () -> Void = {}
    var onPressBegin: (CGFloat) -> Void = { _ in }
    var onPressEnd: () -> Void = {}
    var onCancelPress: () -> Void = {}     // 捏合打断长按：只停快进，不切显隐
    var onPinch: (CGFloat) -> Void = { _ in }
    var onSwipeBack: () -> Void = {}       // 左边缘横滑返回
    // 横滑进度（跟进度条一样）
    var onSeekBegin: () -> Void = {}
    var onSeekChange: (CGFloat) -> Void = { _ in }   // 归一化横向比例
    var onSeekEnd: (Bool) -> Void = { _ in }
    // 竖滑亮度/音量
    var onAdjustBegin: (Bool) -> Void = { _ in }     // true=左半屏(亮度)
    var onAdjustChange: (CGFloat) -> Void = { _ in } // 归一化纵向比例
    var onAdjustEnd: () -> Void = {}

    // 手势识别器：捏合和长按互斥，杜绝双指撑开误触快进
    private var longPress: UILongPressGestureRecognizer?
    private var pinch: UIPinchGestureRecognizer?
    private var doubleTap: UITapGestureRecognizer?
    private var pan: UIPanGestureRecognizer?
    private var panMode = 0            // 0=未判定 1=横滑进度 2=竖滑亮度/音量
    private var panStartX: CGFloat = 0
    private var pressCancelled = false // 长按是否被滑动打断（打断后抬手不切显隐）

    init(player: AVPlayer) {
        super.init(frame: .zero)
        backgroundColor = .black
        playerLayer.player = player
        playerLayer.videoGravity = .resizeAspect
        layer.addSublayer(playerLayer)
        isUserInteractionEnabled = true

        // 双击：暂停/播放。单击需等双击判定失败才触发，否则双击会连带切显隐
        let dtap = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap))
        dtap.numberOfTapsRequired = 2
        dtap.delegate = self
        doubleTap = dtap
        addGestureRecognizer(dtap)

        // 点按：切换控制层
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        tap.delegate = self
        tap.require(toFail: dtap)
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

        // 左边缘横滑：返回（用系统边缘手势，不抢画面中间的滑动）
        let edge = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handleEdgeBack))
        edge.edges = .left
        edge.delegate = self
        addGestureRecognizer(edge)

        /* 单指拖动：一个手势区分三种操作，避免多个手势互相抢
           - 横滑 → 快进/快退（跟进度条一样跟手）
           - 左半屏竖滑 → 亮度
           - 右半屏竖滑 → 音量 */
        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan))
        pan.maximumNumberOfTouches = 1
        pan.delegate = self
        self.pan = pan
        addGestureRecognizer(pan)

        // 画中画的 attach 由 PlayerLayerView 注入 pip 后调用（见 attachPip）
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func attachPip(_ m: PipManager) {
        pipMgr = m
        m.attach(playerLayer)
    }

    @objc private func handleTap() { onTap() }
    @objc private func handleDoubleTap() { onDoubleTap() }

    @objc private func handleEdgeBack(_ g: UIScreenEdgePanGestureRecognizer) {
        // 双指捏合时不响应
        if pinch?.state == .began || pinch?.state == .changed { return }
        switch g.state {
        case .ended:
            if g.translation(in: self).x > 60 { onSwipeBack() }
        default: break
        }
    }

    @objc private func handlePan(_ g: UIPanGestureRecognizer) {
        // 双指捏合进行中 → 单指拖动不参与
        if pinch?.state == .began || pinch?.state == .changed { return }
        let t = g.translation(in: self)

        switch g.state {
        case .began:
            panMode = 0
            panStartX = g.location(in: self).x
            pressCancelled = true
            onCancelPress()          // 打断长按连跳，避免两套 seek 打架

        case .changed:
            if panMode == 0 {
                // 先动够 12pt 再判方向，防止手抖误判
                if abs(t.x) > 12 && abs(t.x) > abs(t.y) {
                    panMode = 1
                    onSeekBegin()
                } else if abs(t.y) > 12 && abs(t.y) > abs(t.x) {
                    panMode = 2
                    onAdjustBegin(panStartX < bounds.width / 2)
                }
            }
            // 传归一化比例：横屏时用视频层宽度换算，不能用 UIScreen（那是竖屏坐标系）
            if panMode == 1 { onSeekChange(t.x / max(1, bounds.width)) }
            else if panMode == 2 { onAdjustChange(t.y / max(1, bounds.height)) }

        case .ended, .cancelled, .failed:
            if panMode == 1 { onSeekEnd(g.state == .cancelled) }
            else if panMode == 2 { onAdjustEnd() }
            panMode = 0

        default: break
        }
    }

    @objc private func handleLongPress(_ g: UILongPressGestureRecognizer) {
        // 双指正在捏合 → 忽略长按，避免误触快进
        if pinch?.state == .began || pinch?.state == .changed { return }
        switch g.state {
        case .began:
            pressCancelled = false
            onPressBegin(g.location(in: self).x)
        case .ended, .cancelled, .failed:
            // 被滑动打断过 → 只清状态，不切显隐
            if pressCancelled { pressCancelled = false } else { onPressEnd() }
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
        // 双指触摸时，单指手势都不该开始
        if pinch?.state == .began || pinch?.state == .changed { return false }
        // 从最左 32pt 内起手的拖动留给"返回"，其余才是快进快退/亮度音量
        if gestureRecognizer === pan {
            return gestureRecognizer.location(in: self).x > 32
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
    var onDoubleTap: () -> Void = {}
    var onPressBegin: (CGFloat) -> Void = { _ in }
    var onPressEnd: () -> Void = {}
    var onCancelPress: () -> Void = {}
    var onPinch: (CGFloat) -> Void = { _ in }
    var onSwipeBack: () -> Void = {}
    var onSeekBegin: () -> Void = {}
    var onSeekChange: (CGFloat) -> Void = { _ in }
    var onSeekEnd: (Bool) -> Void = { _ in }
    var onAdjustBegin: (Bool) -> Void = { _ in }
    var onAdjustChange: (CGFloat) -> Void = { _ in }
    var onAdjustEnd: () -> Void = {}
    var pip: PipManager?

    func makeUIView(context: Context) -> PlayerUIView {
        let v = PlayerUIView(player: player)
        v.onTap = onTap
        v.onDoubleTap = onDoubleTap
        v.onPressBegin = onPressBegin
        v.onPressEnd = onPressEnd
        v.onCancelPress = onCancelPress
        v.onPinch = onPinch
        v.onSwipeBack = onSwipeBack
        v.onSeekBegin = onSeekBegin
        v.onSeekChange = onSeekChange
        v.onSeekEnd = onSeekEnd
        v.onAdjustBegin = onAdjustBegin
        v.onAdjustChange = onAdjustChange
        v.onAdjustEnd = onAdjustEnd
        if let m = pip { v.attachPip(m) }
        return v
    }
    func updateUIView(_ v: PlayerUIView, context: Context) {
        v.gravity = gravity(scaleIdx)
        v.onTap = onTap
        v.onDoubleTap = onDoubleTap
        v.onPressBegin = onPressBegin
        v.onPressEnd = onPressEnd
        v.onCancelPress = onCancelPress
        v.onPinch = onPinch
        v.onSwipeBack = onSwipeBack
        v.onSeekBegin = onSeekBegin
        v.onSeekChange = onSeekChange
        v.onSeekEnd = onSeekEnd
        v.onAdjustBegin = onAdjustBegin
        v.onAdjustChange = onAdjustChange
        v.onAdjustEnd = onAdjustEnd
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


/* 系统音量读写：AVAudioSession.outputVolume 只读，
   改音量要用 MPVolumeView 里那个隐藏的 UISlider（业界通用做法）。*/
final class VolumeManager {
    static let shared = VolumeManager()
    private let box = MPVolumeView(frame: CGRect(x: -2000, y: -2000, width: 40, height: 40))

    private init() {
        box.showsRouteButton = false
        box.alpha = 0.01
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let win = UIApplication.shared.connectedScenes
                .compactMap { ($0 as? UIWindowScene)?.windows.first(where: { $0.isKeyWindow }) }
                .first
            win?.addSubview(self.box)
        }
    }

    private var slider: UISlider? {
        box.subviews.compactMap { $0 as? UISlider }.first
    }

    var current: Double { Double(AVAudioSession.sharedInstance().outputVolume) }

    func set(_ v: Double) {
        let val = Float(max(0, min(1, v)))
        guard let s = slider else { return }
        s.value = val
        s.sendActions(for: .touchUpInside)
    }
}
