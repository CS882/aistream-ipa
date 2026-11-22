import SwiftUI
import UIKit

// 我的：账号卡 + 签到 + 邀请码 + 四个入口（与 Android 版对齐）
struct MeView: View {
    @EnvironmentObject private var app: AppState

    @State private var me: PointsResp?
    @State private var loading = true
    @State private var signing = false
    @State private var toast = ""
    @State private var showHistory = false
    @State private var showFav = false
    @State private var showRedeem = false
    @State private var showInvite = false
    @State private var showPwd = false

    private var vipText: String {
        let lv = me?.vip?.level?.value ?? "0"
        if lv == "0" { return "普通用户" }
        return me?.vip?.name ?? "会员"
    }

    private var pointsText: String {
        me?.points?.value ?? "0"
    }

    private var watchText: String {
        "今日已看 \(me?.daily?.watchMin?.value ?? "0") 分钟"
    }

    private var signed: Bool { me?.checkin?.today == true }

    private var inviteCode: String { me?.invite?.code ?? "" }

    var body: some View {
        ZStack(alignment: .bottom) {
            Theme.bg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("我的")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(Theme.fg)

                    accountCard

                    row("观看历史", "clock.arrow.circlepath") { showHistory = true }
                    row("我的收藏", "star") { showFav = true }
                    row("积分兑换", "gift") { showRedeem = true }
                    row("邀请好友得积分", "person.2.badge.gearshape") { showInvite = true }
                    row("修改密码", "lock") { showPwd = true }
                    row("退出登录", "arrow.right.square", danger: true) {
                        app.logout()
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 30)
            }

            if !toast.isEmpty {
                Text(toast)
                    .font(.system(size: 12))
                    .foregroundColor(Theme.fg)
                    .padding(.horizontal, 16)
                    .frame(height: 36)
                    .glassPill()
                    .padding(.bottom, 24)
            }
        }
        .task { if me == nil { await load() } }
        .sheet(isPresented: $showHistory) {
            CardGridView(title: "历史") { try await Api.history() }
        }
        .sheet(isPresented: $showFav) {
            CardGridView(title: "收藏") { try await Api.favs() }
        }
        .sheet(isPresented: $showRedeem) { RedeemView() }
        .sheet(isPresented: $showInvite) { InviteView(code: inviteCode) }
        .sheet(isPresented: $showPwd) { ChangePasswordView() }
    }

    private var accountCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Circle()
                    .fill(Theme.grad)
                    .frame(width: 44, height: 44)
                    .overlay(
                        Text(String(app.userName.prefix(1)))
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(.white)
                    )
                VStack(alignment: .leading, spacing: 3) {
                    Text(app.userName.isEmpty ? "未登录" : app.userName)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(Theme.fg)
                    Text(vipText)
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: 0xFFD36E))
                }
                Spacer()
                if loading { ProgressView().scaleEffect(0.7).tint(Theme.accentSoft) }
            }

            Text("积分 \(pointsText)")
                .font(.system(size: 12))
                .foregroundColor(Theme.accentSoft)
                .padding(.top, 2)

            Text(watchText)
                .font(.system(size: 12))
                .foregroundColor(Theme.fgWeak)

            HStack(spacing: 10) {
                Button {
                    doSign()
                } label: {
                    Text(signed ? "✓ 已签到" : "签到")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .background(Capsule().fill(signed ? AnyShapeStyle(Theme.card2) : AnyShapeStyle(Theme.grad)))
                }
                .buttonStyle(.plain)
                .disabled(signed || signing)

                Button {
                    copyInvite()
                } label: {
                    Text(inviteCode.isEmpty ? "暂无邀请码" : "邀请码 \(inviteCode)")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.fgDim)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .glassPill()
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 6)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBg()
    }

    private func row(_ title: String, _ icon: String, danger: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundColor(danger ? Color(hex: 0xFF9AA5) : Theme.fgWeak)
                    .frame(width: 20)
                Text(title)
                    .font(.system(size: 14))
                    .foregroundColor(danger ? Color(hex: 0xFF9AA5) : Theme.fg)
                Spacer()
                if !danger {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12))
                        .foregroundColor(Theme.fgWeak)
                }
            }
            .padding(.horizontal, 16)
            .frame(height: 50)
            .frame(maxWidth: .infinity)
            .cardBg(radius: 12)
        }
        .buttonStyle(.plain)
    }

    private func load() async {
        loading = true
        if let r = try? await Api.pointsMe() {
            await MainActor.run { me = r; loading = false }
        } else {
            await MainActor.run { loading = false }
        }
    }

    private func doSign() {
        if signed { tip("今天已经签到过了"); return }
        signing = true
        Task {
            let r = try? await Api.checkin()
            await MainActor.run {
                signing = false
                if r?.ok == true {
                    tip("签到成功，+\(r?.gained?.value ?? "0") 积分")
                    Task { await load() }
                } else {
                    tip(r?.error ?? r?.msg ?? "签到失败")
                }
            }
        }
    }

    private func copyInvite() {
        guard !inviteCode.isEmpty else { tip("还没生成邀请码"); return }
        UIPasteboard.general.string = inviteCode
        tip("邀请码已复制")
    }

    private func tip(_ s: String) {
        toast = s
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
            if toast == s { toast = "" }
        }
    }
}
