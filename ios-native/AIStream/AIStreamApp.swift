import SwiftUI

@main
struct AIStreamApp: App {
    @StateObject private var app = AppState()

    init() {
        /* 启动加速：URLSession 的图片缓存从默认 4MB/40MB 提到 64MB/256MB，
           同一批海报下拉刷新、来回切页时不再重复下载。 */
        URLCache.shared = URLCache(memoryCapacity: 64 * 1024 * 1024,
                                   diskCapacity: 256 * 1024 * 1024,
                                   diskPath: "aistream-images")
        // 启动时恢复主题静态值（跟随系统时用当前界面风格）
        AppState.syncTheme(dark: AppState.resolveDark(Prefs.shared.themeMode),
                           bg: Prefs.shared.themeBg, style: Prefs.shared.themeStyle)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
                .preferredColorScheme(app.darkMode == nil ? nil
                                      : (app.darkMode! ? .dark : .light))
                .background(Theme.bg(for: app.darkMode).ignoresSafeArea())
        }
    }
}

// 全局状态：登录态 + 当前标签
final class AppState: ObservableObject {
    @Published var loggedIn: Bool = Prefs.shared.configured
    @Published var tab: Int = 0
    @Published var userName: String = Prefs.shared.user
    @Published var siteName: String = Prefs.shared.siteName
    // 主题：nil 跟随系统，true 深色，false 浅色
    @Published var darkMode: Bool? = AppState.resolveDark(Prefs.shared.themeMode)
    @Published var themeBg: Int = Prefs.shared.themeBg
    @Published var themeStyle: Int = Prefs.shared.themeStyle
    // 切换主题时递增，RootView 用 .id() 强制重建（静态色值不会自动触发重绘）
    @Published var themeVersion: Int = 0

    static func resolveDark(_ mode: Int) -> Bool? {
        mode == 1 ? true : (mode == 2 ? false : nil)
    }

    // 根据"当前生效的是深色还是浅色"计算主题静态色值
    static func syncTheme(dark: Bool?, bg: Int, style: Int) {
        let isLight = dark == false
        Theme.apply(isLight: isLight, bgIndex: bg, appleTV: style == 1)
    }

    func setTheme(mode: Int, bg: Int, style: Int? = nil) {
        let st = style ?? themeStyle
        Prefs.shared.themeMode = mode
        Prefs.shared.themeBg = bg
        Prefs.shared.themeStyle = st
        darkMode = AppState.resolveDark(mode)
        themeBg = bg
        themeStyle = st
        AppState.syncTheme(dark: darkMode, bg: bg, style: st)
        themeVersion += 1
    }

    func logout() {
        Prefs.shared.clear()
        loggedIn = false
    }
}

struct RootView: View {
    @EnvironmentObject var app: AppState

    var body: some View {
        ZStack {
            Theme.bgGradient.ignoresSafeArea()
            if app.loggedIn {
                MainView()
                    // 启动加速：后台预热分类缓存（首页由 HomeView 自己加载）。
                    // 冷启动先用磁盘缓存渲染，新数据回来静默替换。
                    .task {
                        _ = try? await Api.catalog(kind: "movie")
                    }
            } else {
                LoginView()
            }
        }
        // 主题切换后强制重建整棵树，让所有 Theme.xxx 静态色值重新读取
        .id(app.themeVersion)
    }
}

// tvOS 结构：顶部标签导航 + 内容
struct MainView: View {
    @EnvironmentObject var app: AppState
    private let tabs = ["首页", "分类", "追剧", "直播", "收藏", "我的"]

    var body: some View {
        VStack(spacing: 0) {
            topBar
            /* 六个标签放进系统分页容器：左右滑动即可切换，所有导航栏行为一致。
               用 TabView 而不是自己加 DragGesture 的原因：页面里的横向海报条
               也是 ScrollView，自己写的手势会和它们互相抢（滑海报顺带切标签）；
               TabView 的分页手势由系统协调，内层横向滚动优先。 */
            TabView(selection: $app.tab) {
                HomeView().tag(0)
                CatalogView().tag(1)
                FollowView().tag(2)
                LiveView().tag(3)
                CardGridView(title: "收藏") { try await Api.favs() }.tag(4)
                MeView().tag(5)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.bg)
        }
        .background(Theme.bg.ignoresSafeArea())
    }

    /* 手机竖屏放不下「品牌 + 5 个标签 + 用户名 + 退出」一整行：
       挤在一起时 Spacer 被压到最小，标签会被推到左边裁掉。
       所以拆成两行 —— 上面品牌和退出，下面标签单独一行（可横向滚，防超宽）。 */
    private var topBar: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Text(app.siteName.isEmpty ? "AIStream" : app.siteName)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(Theme.fg)
                    .lineLimit(1)

                Spacer(minLength: 8)

                Text(app.userName)
                    .font(.system(size: 11))
                    .foregroundColor(Theme.fgWeak)
                    .lineLimit(1)

                Button {
                    app.logout()
                } label: {
                    Text("退出")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.fgDim)
                        .padding(.horizontal, 10)
                        .frame(height: 26)
                        .glassPill()
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 18)
            .padding(.top, 4)

            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 22) {
                        ForEach(Array(tabs.enumerated()), id: \.offset) { i, t in
                            Button {
                                withAnimation(.easeInOut(duration: 0.2)) { app.tab = i }
                            } label: {
                                VStack(spacing: 4) {
                                    Text(t)
                                        .font(.system(size: 17, weight: app.tab == i ? .semibold : .regular))
                                        .foregroundColor(app.tab == i ? Color.white : Theme.fgWeak)
                                    Capsule()
                                        .fill(app.tab == i ? Theme.accentSoft : Color.clear)
                                        .frame(width: 24, height: 4)
                                }
                                .padding(.vertical, 2)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .id(i)
                        }
                    }
                    .padding(.horizontal, 18)
                }
                .frame(height: 52)
                // 左右划动切页后，把当前标签滚到可见位置
                .onChange(of: app.tab) { idx in
                    withAnimation(.easeInOut(duration: 0.2)) {
                        proxy.scrollTo(idx, anchor: .center)
                    }
                }
            }
        }
    }
}

struct PlaceholderView: View {
    let text: String
    var body: some View {
        VStack(spacing: 10) {
            Text(text).font(.system(size: 22, weight: .bold)).foregroundColor(Theme.fg)
            Text("这个板块在 iOS 版还没接，先用安卓版看")
                .font(.system(size: 13)).foregroundColor(Theme.fgWeak)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
