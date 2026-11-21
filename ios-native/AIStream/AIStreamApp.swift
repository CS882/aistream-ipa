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
    private let tabs = ["首页", "分类", "直播", "收藏", "我的"]

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ZStack {
                switch app.tab {
                case 0: HomeView()
                case 1: CatalogView()
                case 2: PlaceholderView(text: "直播")
                case 3: PlaceholderView(text: "收藏")
                default: MeView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Theme.bg.ignoresSafeArea())
    }

    private var topBar: some View {
        HStack(spacing: 0) {
            Text(app.siteName.isEmpty ? "AIStream" : app.siteName)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(Theme.fg)

            Spacer(minLength: 12)

            HStack(spacing: 4) {
                ForEach(Array(tabs.enumerated()), id: \.offset) { i, t in
                    Button {
                        app.tab = i
                    } label: {
                        VStack(spacing: 3) {
                            Text(t)
                                .font(.system(size: app.tab == i ? 14.5 : 13.5,
                                              weight: app.tab == i ? .semibold : .regular))
                                .foregroundColor(app.tab == i ? Theme.fg : Theme.fgWeak)
                            Capsule()
                                .fill(app.tab == i ? Theme.accentSoft : Color.clear)
                                .frame(width: 22, height: 3)
                        }
                        .padding(.horizontal, 14)
                        .frame(height: 52)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }

            Spacer(minLength: 12)

            Text(app.userName)
                .font(.system(size: 12))
                .foregroundColor(Theme.fgWeak)

            Button {
                app.logout()
            } label: {
                Text("退出")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.fgDim)
                    .padding(.horizontal, 13)
                    .frame(height: 30)
                    .glassPill()
            }
            .buttonStyle(.plain)
            .padding(.leading, 10)
        }
        .padding(.horizontal, 22)
        .padding(.top, 8)
        .padding(.bottom, 4)
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

// 我的
struct MeView: View {
    @EnvironmentObject var app: AppState
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("我的").font(.system(size: 24, weight: .bold)).foregroundColor(Theme.fg)
                    .padding(.top, 6)

                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 12) {
                        Circle().fill(Theme.grad).frame(width: 44, height: 44)
                            .overlay(Text(String(app.userName.prefix(1))).font(.system(size: 18, weight: .bold)).foregroundColor(.white))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(app.userName.isEmpty ? "未登录" : app.userName)
                                .font(.system(size: 16, weight: .semibold)).foregroundColor(Theme.fg)
                            Text(Prefs.shared.base).font(.system(size: 11)).foregroundColor(Theme.fgWeak)
                        }
                        Spacer()
                    }
                }
                .padding(16)
                .cardBg()
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
    }
}
