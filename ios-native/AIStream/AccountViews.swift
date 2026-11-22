import SwiftUI
import UIKit

// 积分兑换：商品列表 + 我的积分 + 一键兑换
struct RedeemView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var resp: RedeemResp?
    @State private var loading = true
    @State private var toast = ""
    @State private var busyId = ""

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            if loading {
                ProgressView().tint(Theme.accentSoft)
            } else if let r = resp, (r.items ?? []).isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "gift").font(.system(size: 40)).foregroundColor(Theme.fgWeak)
                    Text("暂时没有可兑换的商品").font(.system(size: 14)).foregroundColor(Theme.fgWeak)
                    Text("当前积分 \(r.me?.points?.value ?? "0")")
                        .font(.system(size: 12)).foregroundColor(Theme.accentSoft)
                }
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack {
                            Text("积分兑换").font(.system(size: 24, weight: .bold)).foregroundColor(Theme.fg)
                            Spacer()
                            Button { dismiss() } label: {
                                Image(systemName: "xmark").font(.system(size: 14))
                                    .foregroundColor(Theme.fgDim)
                                    .frame(width: 32, height: 32).glassPill()
                            }.buttonStyle(.plain)
                        }

                        Text("我的积分：\(resp?.me?.points?.value ?? "0")")
                            .font(.system(size: 14)).foregroundColor(Theme.accentSoft)

                        ForEach(resp?.items ?? []) { g in
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(g.title ?? "商品").font(.system(size: 15, weight: .semibold)).foregroundColor(Theme.fg)
                                    if let d = g.desc, !d.isEmpty {
                                        Text(d).font(.system(size: 12)).foregroundColor(Theme.fgWeak).lineLimit(2)
                                    }
                                    Text(redeemCost(g))
                                        .font(.system(size: 12)).foregroundColor(Theme.accentSoft)
                                }
                                Spacer()
                                Button {
                                    redeem(g)
                                } label: {
                                    if busyId == g.id {
                                        ProgressView().scaleEffect(0.6)
                                    } else {
                                        Text(g.soldOut == true ? "已售罄" : "兑换")
                                            .font(.system(size: 13)).foregroundColor(.white)
                                            .padding(.horizontal, 14).frame(height: 34)
                                            .background(Capsule().fill(Theme.grad))
                                    }
                                }
                                .buttonStyle(.plain)
                                .disabled(g.soldOut == true || !busyId.isEmpty)
                            }
                            .padding(14).cardBg()
                        }
                    }
                    .padding(18).padding(.bottom, 30)
                }
            }

            if !toast.isEmpty {
                Text(toast).font(.system(size: 12)).foregroundColor(Theme.fg)
                    .padding(.horizontal, 16).frame(height: 36).glassPill()
                    .padding(.bottom, 24)
            }
        }
        .task { await load() }
    }

    private func redeemCost(_ g: RedeemGood) -> String {
        let cost = g.cost?.value ?? "0"
        let days = g.days?.value ?? ""
        return days.isEmpty ? "\(cost) 积分" : "\(cost) 积分 · \(days)天"
    }

    private func load() async {
        do {
            let r = try await Api.redeemList()
            await MainActor.run { resp = r; loading = false }
        } catch {
            await MainActor.run { loading = false; tip("加载失败") }
        }
    }

    private func redeem(_ g: RedeemGood) {
        busyId = g.id
        Task {
            let r = try? await Api.redeem(id: g.id)
            await MainActor.run {
                busyId = ""
                if r?.ok == true {
                    tip("兑换成功")
                    Task { await load() }
                } else {
                    tip(r?.error ?? "兑换失败")
                }
            }
        }
    }

    private func tip(_ s: String) {
        toast = s
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) { if toast == s { toast = "" } }
    }
}

// 邀请好友：展示邀请码 + 复制 + 说明
struct InviteView: View {
    @Environment(\.dismiss) private var dismiss
    let code: String
    @State private var info: InviteResp?
    @State private var toast = ""

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    HStack {
                        Text("邀请好友").font(.system(size: 24, weight: .bold)).foregroundColor(Theme.fg)
                        Spacer()
                        Button { dismiss() } label: {
                            Image(systemName: "xmark").font(.system(size: 14))
                                .foregroundColor(Theme.fgDim).frame(width: 32, height: 32).glassPill()
                        }.buttonStyle(.plain)
                    }

                    VStack(spacing: 10) {
                        Image(systemName: "person.2.badge.gearshape")
                            .font(.system(size: 40)).foregroundColor(Theme.accentSoft)
                        Text("邀请好友，双方都得积分")
                            .font(.system(size: 15, weight: .semibold)).foregroundColor(Theme.fg)
                        Text("每邀请一位好友注册，可得 \(info?.perInvite?.value ?? "50") 积分")
                            .font(.system(size: 12)).foregroundColor(Theme.fgWeak)

                        if !code.isEmpty {
                            Text(code).font(.system(size: 28, weight: .bold, design: .monospaced))
                                .foregroundColor(.white)
                                .padding(.horizontal, 24).frame(height: 56)
                                .background(RoundedRectangle(cornerRadius: 14).fill(Theme.card))

                            Button {
                                UIPasteboard.general.string = code
                                toast = "邀请码已复制"
                            } label: {
                                Text("复制邀请码")
                                    .font(.system(size: 14, weight: .semibold)).foregroundColor(.white)
                                    .frame(maxWidth: .infinity).frame(height: 44)
                                    .background(Capsule().fill(Theme.grad))
                            }.buttonStyle(.plain)
                        }
                    }
                    .padding(20).cardBg()

                    Text("已邀请 \(info?.invited?.value ?? "0") 人")
                        .font(.system(size: 13)).foregroundColor(Theme.fgWeak)
                }
                .padding(18)
            }
            if !toast.isEmpty {
                Text(toast).font(.system(size: 12)).foregroundColor(Theme.fg)
                    .padding(.horizontal, 16).frame(height: 36).glassPill().padding(.bottom, 24)
            }
        }
        .task {
            if let r = try? await Api.invite() { await MainActor.run { info = r } }
        }
    }
}

// 修改密码
struct ChangePasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var oldPw = ""
    @State private var newPw = ""
    @State private var confirm = ""
    @State private var busy = false
    @State private var toast = ""

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("修改密码").font(.system(size: 24, weight: .bold)).foregroundColor(Theme.fg)
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").font(.system(size: 14))
                            .foregroundColor(Theme.fgDim).frame(width: 32, height: 32).glassPill()
                    }.buttonStyle(.plain)
                }

                SecureField("原密码", text: $oldPw).fieldStyle()
                SecureField("新密码", text: $newPw).fieldStyle()
                SecureField("确认新密码", text: $confirm).fieldStyle()

                Button {
                    submit()
                } label: {
                    if busy { ProgressView().tint(.white).frame(maxWidth: .infinity).frame(height: 46) }
                    else {
                        Text("确认修改").font(.system(size: 15, weight: .semibold)).foregroundColor(.white)
                            .frame(maxWidth: .infinity).frame(height: 46).background(Capsule().fill(Theme.grad))
                    }
                }.buttonStyle(.plain).disabled(busy)

                Spacer()
            }
            .padding(20)
            if !toast.isEmpty {
                Text(toast).font(.system(size: 12)).foregroundColor(Theme.fg)
                    .padding(.horizontal, 16).frame(height: 36).glassPill().padding(.bottom, 24)
            }
        }
    }

    private func submit() {
        guard !oldPw.isEmpty, !newPw.isEmpty else { tip("请填完整"); return }
        guard newPw == confirm else { tip("两次新密码不一致"); return }
        busy = true
        Task {
            let r = try? await Api.changePassword(old: oldPw, new: newPw)
            await MainActor.run {
                busy = false
                if r?.ok == true {
                    tip("修改成功")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { dismiss() }
                } else {
                    tip(r?.error ?? "修改失败")
                }
            }
        }
    }

    private func tip(_ s: String) {
        toast = s
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) { if toast == s { toast = "" } }
    }
}

private extension View {
    func fieldStyle() -> some View {
        self.font(.system(size: 14)).foregroundColor(Theme.fg)
            .padding(.horizontal, 16).frame(height: 46)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.05)))
    }
}

// 注册：用户名/密码/确认/邀请码，成功后回调登录
struct RegisterView: View {
    @Environment(\.dismiss) private var dismiss
    let onDone: (String, String) -> Void

    @State private var user = ""
    @State private var pass = ""
    @State private var confirm = ""
    @State private var invite = ""
    @State private var busy = false
    @State private var toast = ""

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text("注册账号").font(.system(size: 24, weight: .bold)).foregroundColor(Theme.fg)
                        Spacer()
                        Button { dismiss() } label: {
                            Image(systemName: "xmark").font(.system(size: 14))
                                .foregroundColor(Theme.fgDim).frame(width: 32, height: 32).glassPill()
                        }.buttonStyle(.plain)
                    }

                    TextField("用户名", text: $user).fieldStyle()
                    SecureField("密码", text: $pass).fieldStyle()
                    SecureField("确认密码", text: $confirm).fieldStyle()
                    TextField("邀请码（可选）", text: $invite).fieldStyle()

                    Text("邀请码可以填好友的，双方都得积分；没有就留空")
                        .font(.system(size: 11)).foregroundColor(Theme.fgWeak)

                    Button {
                        submit()
                    } label: {
                        if busy { ProgressView().tint(.white).frame(maxWidth: .infinity).frame(height: 46) }
                        else {
                            Text("注册并登录").font(.system(size: 15, weight: .semibold)).foregroundColor(.white)
                                .frame(maxWidth: .infinity).frame(height: 46).background(Capsule().fill(Theme.grad))
                        }
                    }.buttonStyle(.plain).disabled(busy).padding(.top, 6)

                    Spacer().frame(height: 30)
                }
                .padding(20)
            }
            if !toast.isEmpty {
                Text(toast).font(.system(size: 12)).foregroundColor(Theme.fg)
                    .padding(.horizontal, 16).frame(height: 36).glassPill().padding(.bottom, 24)
            }
        }
    }

    private func submit() {
        let u = user.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !u.isEmpty else { tip("请填用户名"); return }
        guard !pass.isEmpty else { tip("请填密码"); return }
        guard pass == confirm else { tip("两次密码不一致"); return }
        busy = true
        Task {
            do {
                let r = try await Api.register(user: u, pass: pass, invite: invite)
                guard let tk = r.token, !tk.isEmpty else {
                    throw ApiError.msg(r.error ?? "注册没返回 token")
                }
                Prefs.shared.token = tk
                Prefs.shared.user = r.user?.username ?? u
                await MainActor.run {
                    busy = false
                    onDone(u, pass)
                }
            } catch {
                await MainActor.run {
                    busy = false
                    tip((error as? LocalizedError)?.errorDescription ?? "注册失败")
                }
            }
        }
    }

    private func tip(_ s: String) {
        toast = s
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) { if toast == s { toast = "" } }
    }
}
