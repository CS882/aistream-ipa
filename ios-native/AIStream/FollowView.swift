import SwiftUI

// 追剧：服务端没有 subscribe 接口，用本地存储。
// 布局参考用户截图：顶部一周日期条，下面按天分列，每列竖排追的剧海报。
struct FollowView: View {
    @State private var items: [FollowItem] = Prefs.shared.follows
    @State private var pick: Card?
    @State private var weekOffset = 0

    private let weekdaySymbols = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]

    // 当前显示的这一周（weekOffset=0 本周，-1 上周）
    private var weekStart: Date {
        let cal = Calendar.current
        let now = cal.startOfDay(for: Date())
        let wd = cal.component(.weekday, from: now) // 1=周日
        let monday = cal.date(byAdding: .day, value: -(wd == 1 ? 6 : wd - 2), to: now)!
        return cal.date(byAdding: .day, value: weekOffset * 7, to: monday)!
    }

    private var days: [Date] {
        (0..<7).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: weekStart) }
    }

    private func itemsFor(_ day: Date) -> [FollowItem] {
        let cal = Calendar.current
        return items.filter { cal.isDate(Date(timeIntervalSince1970: $0.addAt), inSameDayAs: day) }
    }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 0) {
                // 标题 + 周切换
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("我的追剧日历").font(.system(size: 24, weight: .bold)).foregroundColor(Theme.fg)
                        Text(dateRangeText).font(.system(size: 11)).foregroundColor(Theme.fgWeak)
                    }
                    Spacer()
                }
                .padding(.horizontal, 20)
                .padding(.top, 6)

                HStack(spacing: 8) {
                    Button { weekOffset -= 1 } label: {
                        Text("← 上一周").font(.system(size: 12)).foregroundColor(Theme.fgDim)
                            .padding(.horizontal, 12).frame(height: 30).glassPill()
                    }.buttonStyle(.plain)
                    Button { weekOffset += 1 } label: {
                        Text("下一周 →").font(.system(size: 12)).foregroundColor(Theme.fgDim)
                            .padding(.horizontal, 12).frame(height: 30).glassPill()
                    }.buttonStyle(.plain)
                    Button { weekOffset = 0 } label: {
                        Text("回到本周").font(.system(size: 12)).foregroundColor(Theme.fgDim)
                            .padding(.horizontal, 12).frame(height: 30).glassPill()
                    }.buttonStyle(.plain)
                }
                .padding(.horizontal, 20)
                .padding(.top, 10)

                if items.isEmpty {
                    Spacer()
                    VStack(spacing: 10) {
                        Image(systemName: "bookmark").font(.system(size: 40)).foregroundColor(Theme.fgWeak)
                        Text("还没有追剧").font(.system(size: 17, weight: .semibold)).foregroundColor(Theme.fg)
                        Text("在详情页点「＋追剧」加入，会按加入日期显示在日历里")
                            .font(.system(size: 12)).foregroundColor(Theme.fgWeak)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    Spacer()
                } else {
                    // 7 天横向列，每列竖排海报（与截图一致）
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: 12) {
                            ForEach(days, id: \.self) { day in
                                dayColumn(day)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 12)
                    }
                }
            }
        }
        .onAppear { items = Prefs.shared.follows }
        .fullScreenCover(item: $pick) { c in DetailView(card: c) }
    }

    private var dateRangeText: String {
        let f = DateFormatter()
        f.dateFormat = "M月d日"
        return "\(f.string(from: days.first ?? Date())) - \(f.string(from: days.last ?? Date()))"
    }

    private func dayColumn(_ day: Date) -> some View {
        let cal = Calendar.current
        let wd = cal.component(.weekday, from: day)
        let dayItems = itemsFor(day)
        let isToday = cal.isDateInToday(day)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                Text(weekdaySymbols[wd - 1]).font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Theme.fg)
                Text("\(cal.component(.day, from: day))日").font(.system(size: 12))
                    .foregroundColor(Theme.fgWeak)
                if isToday {
                    Text("今天").font(.system(size: 10)).foregroundColor(.white)
                        .padding(.horizontal, 6).frame(height: 18)
                        .background(Capsule().fill(Theme.accent))
                }
            }
            Text("电视剧 \(dayItems.count) 部").font(.system(size: 11)).foregroundColor(Theme.fgWeak)

            if dayItems.isEmpty {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.white.opacity(0.03))
                    .frame(width: 118, height: 170)
                    .overlay(Text("暂无").font(.system(size: 11)).foregroundColor(Theme.fgWeak))
            } else {
                ForEach(dayItems) { f in
                    VStack(alignment: .leading, spacing: 0) {
                        PosterCard(card: FollowView.toCard(f), fixedWidth: 118) {
                            pick = FollowView.toCard(f)
                        }
                        Button {
                            Prefs.shared.removeFollow(id: f.id)
                            items = Prefs.shared.follows
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 11)).foregroundColor(Theme.fgWeak)
                        }
                        .buttonStyle(.plain)
                        .padding(.leading, 4)
                    }
                }
            }
            Spacer()
        }
        .frame(width: 126)
    }

    static func toCard(_ f: FollowItem) -> Card {
        Card(rawId: FlexStr(f.id), title: f.title, poster: f.poster, posterUrl: nil,
             year: FlexStr(f.year), score: nil, media: nil, station: nil)
    }
}
