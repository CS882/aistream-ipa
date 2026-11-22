import SwiftUI

@main
struct AIStreamApp: App {
    @StateObject private var app = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
                .preferredColorScheme(.dark)
                .background(Theme.bg.ignoresSafeArea())
        }
    }
}

// 全局状态：登录态 + 当前标签
final class AppState: ObservableObject {
    @Published var loggedIn: Bool = Prefs.shared.configured
    @Published var tab: Int = 0
    @Published var userName: String = Prefs.shared.user
    @Published var siteName: String = Prefs.shared.siteName

    func logout() {
        Prefs.shared.clear()
        loggedIn = false
    }
}

struct RootView: View {
    @EnvironmentObject var app: AppState

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            if app.loggedIn {
                MainView()
            } else {
                LoginView()
            }
        }
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
