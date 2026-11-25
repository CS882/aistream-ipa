import SwiftUI

/* tvOS 风格主题：默认深色与 Android 一致；支持浅色外观 + 预设背景。
   色值按 isLight 动态计算，所有 Theme.xxx 调用点无需改动。 */
enum Theme {
    // 由 AppState 在切换主题时写入；true=浅色外观
    static var isLight = false
    static var bgIndex = 0

    // MARK: 预设背景（5 套）
    struct Preset: Identifiable {
        let id: Int
        let name: String
        let dark: [Color]
        let light: [Color]
    }

    static let presets: [Preset] = [
        Preset(id: 0, name: "深空黑", dark: [Color(hex: 0x05060A), Color(hex: 0x12131A)],
               light: [Color(hex: 0xF5F6FA), Color(hex: 0xE8EAF2)]),
        Preset(id: 1, name: "暗夜蓝", dark: [Color(hex: 0x070B18), Color(hex: 0x14213D)],
               light: [Color(hex: 0xEAF1FF), Color(hex: 0xD4E3FF)]),
        Preset(id: 2, name: "紫罗兰", dark: [Color(hex: 0x120A1E), Color(hex: 0x2A1740)],
               light: [Color(hex: 0xF3EBFF), Color(hex: 0xE3D4FF)]),
        Preset(id: 3, name: "极光绿", dark: [Color(hex: 0x06130F), Color(hex: 0x123528)],
               light: [Color(hex: 0xEAF7F1), Color(hex: 0xD3EEDF)]),
        Preset(id: 4, name: "暖阳橘", dark: [Color(hex: 0x1A1008), Color(hex: 0x3A2410)],
               light: [Color(hex: 0xFFF4E8), Color(hex: 0xFFE3C4)])
    ]

    private static var preset: Preset {
        presets[min(max(0, bgIndex), presets.count - 1)]
    }

    // 背景渐变（供页面底层用）；保留 bg 为纯色兼容旧代码
    static var bgGradient: LinearGradient {
        let p = preset
        return LinearGradient(colors: isLight ? p.light : p.dark,
                              startPoint: .top, endPoint: .bottom)
    }

    static var bg: Color { isLight ? preset.light[0] : preset.dark[0] }

    // 供 App 入口显式指定外观（system=nil）
    static func bg(for dark: Bool?) -> Color {
        if let d = dark { return d ? preset.dark[0] : preset.light[0] }
        return bg
    }

    static var card: Color {
        isLight ? Color.white.opacity(0.92) : Color(hex: 0x15151C)
    }
    static var card2: Color {
        isLight ? Color(hex: 0xF0F1F6) : Color(hex: 0x1E1F27)
    }
    static var fg: Color { isLight ? Color(hex: 0x1A1A22) : Color(hex: 0xF7F7FA) }
    static var fgDim: Color { isLight ? Color(hex: 0x4A4A56) : Color(hex: 0xB9BAC4) }
    static var fgWeak: Color { isLight ? Color(hex: 0x7A7A88) : Color(hex: 0x7A7C88) }
    static let accent = Color(hex: 0x8B6CFF)
    static let accentSoft = Color(hex: 0xB45CFF)
    static let accentPink = Color(hex: 0xF060C0)
    static var line: Color { isLight ? Color.black.opacity(0.08) : Color.white.opacity(0.09) }

    static let grad = LinearGradient(
        colors: [Color(hex: 0x8F7BFF), Color(hex: 0xB45CFF), Color(hex: 0xF060C0)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    // 切换主题时由 AppState 调用，统一更新静态值
    static func apply(isLight light: Bool, bgIndex bg: Int) {
        isLight = light
        bgIndex = bg
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8) & 0xFF) / 255.0,
            blue: Double(hex & 0xFF) / 255.0,
            opacity: 1.0
        )
    }
}

extension View {
    // 玻璃胶囊底
    func glassPill(radius: CGFloat = 999) -> some View {
        self.background(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(Color.white.opacity(0.06))
                .overlay(
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.12), lineWidth: 1)
                )
        )
    }

    func cardBg(radius: CGFloat = 14) -> some View {
        self.background(
            RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Theme.card)
        )
    }
}

// 主按钮：紫粉渐变胶囊
struct GradientButton: View {
    let title: String
    var height: CGFloat = 48
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .frame(height: height)
                .background(
                    RoundedRectangle(cornerRadius: 999, style: .continuous).fill(Theme.grad)
                )
        }
        .buttonStyle(.plain)
    }
}

// 次级按钮：玻璃胶囊
struct GhostButton: View {
    let title: String
    var height: CGFloat = 48
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(Theme.fg)
                .frame(maxWidth: .infinity)
                .frame(height: height)
                .glassPill()
        }
        .buttonStyle(.plain)
    }
}

// 筛选胶囊
struct FilterChip: View {
    let text: String
    var on: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(text)
                .font(.system(size: 12))
                .lineLimit(1)
                .foregroundColor(on ? Theme.accentSoft : Theme.fgDim)
                .padding(.horizontal, 11)
                .frame(height: 30)
                .background(
                    RoundedRectangle(cornerRadius: 999, style: .continuous)
                        .fill(on ? Theme.accentSoft.opacity(0.16) : Color.white.opacity(0.07))
                        .overlay(
                            RoundedRectangle(cornerRadius: 999, style: .continuous)
                                .strokeBorder(on ? Theme.accentSoft.opacity(0.6) : Color.clear, lineWidth: 1)
                        )
                )
        }
        .buttonStyle(.plain)
    }
}
