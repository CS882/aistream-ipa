import SwiftUI

// 登录页：与 Android 版同一套排版（居中玻璃卡片，无域名端口）
struct LoginView: View {
    @EnvironmentObject var app: AppState

    @State private var user = Prefs.shared.user
    @State private var pass = Prefs.shared.rememberPass ? Prefs.shared.pass : ""
    @State private var remember = Prefs.shared.rememberPass
    @State private var busy = false
    @State private var err = ""
    @FocusState private var focus: Int?
    @State private var showRegister = false

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 0) {
                    Spacer().frame(height: 60)

                    HStack(spacing: 8) {
                        RoundedRectangle(cornerRadius: 6)
                            .fill(Theme.grad)
                            .frame(width: 22, height: 22)
                        Text("AIStream").font(.system(size: 30, weight: .bold)).foregroundColor(Theme.fg)
                        Text("影视").font(.system(size: 26, weight: .bold)).foregroundStyle(Theme.grad)
                    }
                    Text("登录你的影视站点")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.fgWeak)
                        .padding(.top, 8)

                    VStack(spacing: 12) {
                        field("用户名", text: $user, idx: 0, secure: false)
                        field("密码", text: $pass, idx: 1, secure: true)

                        Toggle(isOn: $remember) {
                            Text("记住账号密码").font(.system(size: 13)).foregroundColor(Theme.fgDim)
                        }
                        .toggleStyle(SwitchToggleStyle(tint: Theme.accent))
                        .padding(.top, 2)

                        if !err.isEmpty {
                            Text(err)
                                .font(.system(size: 12))
                                .foregroundColor(Color(hex: 0xFF9AA5))
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        GradientButton(title: busy ? "连接中…" : "登录", height: 50) {
                            submit()
                        }
                        .disabled(busy)
                        .opacity(busy ? 0.6 : 1)
                        .padding(.top, 6)
                    }
                    .padding(24)
                    .background(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .fill(Color.white.opacity(0.045))
                            .overlay(
                                RoundedRectangle(cornerRadius: 22, style: .continuous)
                                    .strokeBorder(Color.white.opacity(0.10), lineWidth: 1)
                            )
                    )
                    .padding(.top, 24)
                    .padding(.horizontal, 22)

                    Button {
                        showRegister = true
                    } label: {
                        HStack(spacing: 4) {
                            Text("没有账号？").font(.system(size: 13)).foregroundColor(Theme.fgWeak)
                            Text("立即注册").font(.system(size: 13, weight: .semibold)).foregroundColor(Theme.accentSoft)
                        }
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 16)

                    Text("原生客户端 v1.6.0")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.fgWeak)
                        .padding(.top, 18)
                    Spacer().frame(height: 40)
                }
                .frame(maxWidth: 460)
                .frame(maxWidth: .infinity)
            }
        }
        .sheet(isPresented: $showRegister) {
            RegisterView { u, p in
                // 注册成功后回填登录框并直接登录
                user = u
                pass = p
                showRegister = false
                submit()
            }
        }
    }

    private func field(_ hint: String, text: Binding<String>, idx: Int, secure: Bool) -> some View {
        Group {
            if secure {
                SecureField(hint, text: text)
            } else {
                TextField(hint, text: text)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
        }
        .focused($focus, equals: idx)
        .font(.system(size: 14))
        .foregroundColor(Theme.fg)
        .padding(.horizontal, 16)
        .frame(height: 46)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.05))
        )
    }

    private func submit() {
        err = ""
        let u = user.trimmingCharacters(in: .whitespacesAndNewlines)
        if u.isEmpty { err = "用户名没填"; return }
        if pass.isEmpty { err = "密码没填"; return }

        busy = true
        Task {
            do {
                let r = try await Api.login(user: u, pass: pass)
                guard let tk = r.token, !tk.isEmpty else {
                    throw ApiError.msg("服务端没返回 token")
                }
                Prefs.shared.token = tk
                Prefs.shared.user = u
                Prefs.shared.rememberPass = remember
                Prefs.shared.pass = remember ? pass : ""
                if let rn = r.user?.username, !rn.isEmpty {
                    Prefs.shared.user = rn
                }
                // 站点名给顶栏用
                if let info = try? await Api.publicInfo(), let sn = info.siteName, !sn.isEmpty {
                    Prefs.shared.siteName = sn
                }
                await MainActor.run {
                    app.userName = Prefs.shared.user
                    app.siteName = Prefs.shared.siteName
                    app.loggedIn = true
                    busy = false
                }
            } catch {
                await MainActor.run {
                    err = message(error)
                    busy = false
                }
            }
        }
    }

    private func message(_ e: Error) -> String {
        let s = (e as? LocalizedError)?.errorDescription ?? e.localizedDescription
        if s.lowercased().contains("ssl") || s.lowercased().contains("certificate") {
            return "证书校验失败，站点是 http 的话检查地址"
        }
        if s.contains("Could not connect") || s.contains("timed out") {
            return "连不上服务器，确认站点在跑、端口对"
        }
        return s
    }
}
