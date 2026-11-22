import SwiftUI

// 追剧：服务端没有 subscribe 接口，用本地存储（在详情页点「追剧」加入）
struct FollowView: View {
    @State private var items: [FollowItem] = Prefs.shared.follows
    @State private var pick: Card?

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            if items.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "bookmark").font(.system(size: 40)).foregroundColor(Theme.fgWeak)
                    Text("还没有追剧").font(.system(size: 17, weight: .semibold)).foregroundColor(Theme.fg)
                    Text("在详情页点「追剧」加入")
                        .font(.system(size: 12)).foregroundColor(Theme.fgWeak)
                }
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("我的追剧  ·  \(items.count) 部")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(Theme.fg)

                        LazyVGrid(
                            columns: [GridItem(.adaptive(minimum: 100, maximum: 150), spacing: 12)],
                            spacing: 14
                        ) {
                            ForEach(items) { f in
                                VStack(alignment: .leading, spacing: 0) {
                                    PosterCard(
                                        card: FollowView.toCard(f),
                                        fixedWidth: nil
                                    ) {
                                        pick = FollowView.toCard(f)
                                    }

                                    HStack {
                                        Text(f.lastEp.isEmpty ? "追剧中" : f.lastEp)
                                            .font(.system(size: 10)).foregroundColor(Theme.fgWeak)
                                            .lineLimit(1)
                                        Spacer()
                                        Button {
                                            Prefs.shared.removeFollow(id: f.id)
                                            items = Prefs.shared.follows
                                        } label: {
                                            Image(systemName: "xmark.circle.fill")
                                                .font(.system(size: 12)).foregroundColor(Theme.fgWeak)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                    .padding(.horizontal, 4)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 24)
                }
            }
        }
        .onAppear { items = Prefs.shared.follows }
        .fullScreenCover(item: $pick) { c in DetailView(card: c) }
    }

    static func toCard(_ f: FollowItem) -> Card {
        Card(rawId: FlexStr(f.id), title: f.title, poster: f.poster, posterUrl: nil,
             year: FlexStr(f.year), score: nil, media: nil, station: nil)
    }
}
