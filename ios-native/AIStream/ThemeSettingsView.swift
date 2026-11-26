import SwiftUI

// 外观主题设置：深色/浅色/跟随系统 + 5 套预设背景
struct ThemeSettingsView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var mode: Int = Prefs.shared.themeMode
    @State private var bg: Int = Prefs.shared.themeBg
    @State private var style: Int = Prefs.shared.themeStyle

    private let modes: [(Int, String, String)] = [
        (0, "跟随系统", "settings.iphone"),
        (1, "深色", "moon.stars.fill"),
        (2, "浅色", "sun.max.fill")
    ]

    var body: some View {
        NavigationView {
            ZStack {
                Theme.bg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        // 外观
                        VStack(alignment: .leading, spacing: 10) {
                            Text("外观").font(.system(size: 15, weight: .semibold))
                                .foregroundColor(Theme.fg)
                            HStack(spacing: 10) {
                                ForEach(modes, id: \.0) { m in
                                    modeCard(m.1, icon: m.2, on: mode == m.0) {
                                        mode = m.0
                                        apply()
                                    }
                                }
                            }
                        }

                        // 界面风格：不止换背景，整体卡片/按钮/焦点都变
                        VStack(alignment: .leading, spacing: 10) {
                            Text("界面风格").font(.system(size: 15, weight: .semibold))
                                .foregroundColor(Theme.fg)
                            HStack(spacing: 10) {
                                styleCard(0, title: "标准", icon: "square.grid.2x2",
                                          sub: "紫粉 · 原生", on: style == 0) {
                                    style = 0; apply()
                                }
                                styleCard(1, title: "Apple TV", icon: "tv.2",
                                          sub: "玻璃 · 银蓝", on: style == 1) {
                                    style = 1; apply()
                                }
                            }
                        }

                        // 背景
                        VStack(alignment: .leading, spacing: 10) {
                            Text("背景").font(.system(size: 15, weight: .semibold))
                                .foregroundColor(Theme.fg)
                            LazyVGrid(
                                columns: [GridItem(.adaptive(minimum: 100), spacing: 12)],
                                spacing: 12
                            ) {
                                ForEach(Theme.presets) { p in
                                    bgCard(p)
                                }
                            }
                        }

                        Text("切换后立即生效，设置会保存在本机")
                            .font(.system(size: 11))
                            .foregroundColor(Theme.fgWeak)
                    }
                    .padding(18)
                }
            }
            .navigationTitle("外观主题")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") { dismiss() }.foregroundColor(Theme.accentSoft)
                }
            }
        }
    }

    // 外观卡片
    private func modeCard(_ title: String, icon: String, on: Bool,
                          action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 22))
                    .foregroundColor(on ? .white : Theme.fgWeak)
                Text(title)
                    .font(.system(size: 12))
                    .foregroundColor(on ? .white : Theme.fgDim)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 74)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(on ? AnyShapeStyle(Theme.grad) : AnyShapeStyle(Theme.card))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(on ? Color.white.opacity(0.4) : Theme.line, lineWidth: on ? 1.5 : 1)
            )
        }
        .buttonStyle(PressScaleStyle())
    }

    // 风格卡片：用小样直观展示卡片与强调色的整体差异
    private func styleCard(_ id: Int, title: String, icon: String, sub: String,
                           on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 22))
                    .foregroundColor(on ? .white : Theme.fgWeak)
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(on ? .white : Theme.fg)
                Text(sub)
                    .font(.system(size: 10))
                    .foregroundColor(on ? Color.white.opacity(0.75) : Theme.fgWeak)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .frame(height: 92, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(on ? AnyShapeStyle(Theme.grad) : AnyShapeStyle(Theme.card))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(on ? Color.white.opacity(0.45) : Theme.line,
                                  lineWidth: on ? 1.5 : 1)
            )
        }
        .buttonStyle(PressScaleStyle())
    }

    // 背景预览卡片
    private func bgCard(_ p: Theme.Preset) -> some View {
        let on = bg == p.id
        let colors = mode == 2 ? p.light : p.dark  // 浅色模式显示浅色预览
        return Button {
            bg = p.id
            apply()
        } label: {
            VStack(spacing: 6) {
                ZStack {
                    LinearGradient(colors: colors, startPoint: .top, endPoint: .bottom)
                    if on {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundColor(.white)
                            .shadow(radius: 4)
                    }
                }
                .frame(height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text(p.name)
                    .font(.system(size: 11))
                    .foregroundColor(on ? Theme.accentSoft : Theme.fgDim)
            }
            .padding(8)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Theme.card)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(on ? Theme.accentSoft : Theme.line, lineWidth: on ? 1.5 : 1)
            )
        }
        .buttonStyle(PressScaleStyle())
    }

    private func apply() {
        app.setTheme(mode: mode, bg: bg, style: style)
    }
}
