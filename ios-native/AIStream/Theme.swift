import SwiftUI

// tvOS 风格配色，与 Android 版保持一致
enum Theme {
    static let bg = Color(hex: 0x05060A)
    static let card = Color(hex: 0x15151C)
    static let card2 = Color(hex: 0x1E1F27)
    static let fg = Color(hex: 0xF7F7FA)
    static let fgDim = Color(hex: 0xB9BAC4)
    static let fgWeak = Color(hex: 0x7A7C88)
    static let accent = Color(hex: 0x8B6CFF)
    static let accentSoft = Color(hex: 0xB45CFF)
    static let accentPink = Color(hex: 0xF060C0)
    static let line = Color.white.opacity(0.09)

    static let grad = LinearGradient(
        colors: [Color(hex: 0x8F7BFF), Color(hex: 0xB45CFF), Color(hex: 0xF060C0)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
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
