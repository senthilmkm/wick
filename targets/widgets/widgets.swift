import WidgetKit
import SwiftUI

struct WickWidgetSnapshot: Codable {
  let state: String
  let flameIntensity: Double
  let flameColorHex: String
  let stepsToday: Int
  let expectedStepsNow: Int
  let streakDays: Int
}

struct WickFriendSnapshot: Codable {
  let displayName: String
  let state: String
  let flameIntensity: Double
  let streakDays: Int
}
struct WickEntry: TimelineEntry {
  let date: Date
  let snapshot: WickWidgetSnapshot
  let friend: WickFriendSnapshot?
}

struct WickProvider: TimelineProvider {
  private let appGroupId = "group.com.senthilmkm.wick"
  private static let placeholderSnapshot = WickWidgetSnapshot(
    state: "BLAZING",
    flameIntensity: 0.9,
    flameColorHex: "#FFF6D6",
    stepsToday: 6420,
    expectedStepsNow: 5800,
    streakDays: 14
  )
  private static let uninitializedSnapshot = WickWidgetSnapshot(
    state: "UNLIT_MORNING",
    flameIntensity: 0.0,
    flameColorHex: "#A1A1AA",
    stepsToday: 0,
    expectedStepsNow: 0,
    streakDays: 0
  )

  func placeholder(in context: Context) -> WickEntry {
    WickEntry(date: Date(), snapshot: Self.placeholderSnapshot, friend: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (WickEntry) -> Void) {
    completion(loadEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<WickEntry>) -> Void) {
    let entry = loadEntry()
    let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
    completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
  }

  private func loadFriend() -> WickFriendSnapshot? {
    guard
      let raw = UserDefaults(suiteName: appGroupId)?.string(forKey: "wick.widget.friend"),
      !raw.isEmpty,
      let data = raw.data(using: .utf8),
      let decoded = try? JSONDecoder().decode(WickFriendSnapshot.self, from: data)
    else {
      return nil
    }
    return decoded
  }

  private func loadEntry() -> WickEntry {
    let friend = loadFriend()
    guard
      let data = UserDefaults(suiteName: appGroupId)?.string(forKey: "wick.widget.snapshot")?.data(using: .utf8),
      let decoded = try? JSONDecoder().decode(WickWidgetSnapshot.self, from: data)
    else {
      return WickEntry(date: Date(), snapshot: Self.uninitializedSnapshot, friend: friend)
    }
    return WickEntry(date: Date(), snapshot: decoded, friend: friend)
  }
}

struct WickWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: WickEntry

  private var stateLabel: String {
    entry.snapshot.state
      .replacingOccurrences(of: "_", with: " ")
      .capitalized
  }

  private func friendStateLabel(_ friend: WickFriendSnapshot) -> String {
    friend.state.replacingOccurrences(of: "_", with: " ").capitalized
  }

  var body: some View {
    switch family {
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        VStack(spacing: 2) {
          Image(systemName: entry.snapshot.flameIntensity > 0 ? "flame.fill" : "smoke.fill")
          Text("\(entry.snapshot.streakDays)d")
            .font(.caption2.bold())
        }
      }
      .widgetURL(URL(string: "wick://home"))
    case .accessoryRectangular:
      if let friend = entry.friend {
        HStack(spacing: 8) {
          Image(systemName: friend.flameIntensity > 0 ? "flame.fill" : "smoke.fill")
            .font(.title3)
          VStack(alignment: .leading) {
            Text(friend.displayName)
              .font(.headline)
            Text("\(friendStateLabel(friend)) • \(friend.streakDays)d streak")
              .font(.caption2)
          }
        }
        .widgetURL(URL(string: "wick://circle"))
      } else {
        HStack(spacing: 8) {
          Image(systemName: entry.snapshot.flameIntensity > 0 ? "flame.fill" : "smoke.fill")
            .font(.title3)
          VStack(alignment: .leading) {
            Text("Wick • \(stateLabel)")
              .font(.headline)
            Text("\(entry.snapshot.stepsToday) steps • \(entry.snapshot.streakDays)d streak")
              .font(.caption2)
          }
        }
        .widgetURL(URL(string: "wick://home"))
      }
    case .accessoryInline:
      if let friend = entry.friend {
        Label("\(friend.displayName): \(friendStateLabel(friend))", systemImage: "flame.fill")
      } else {
        Label("Wick: \(stateLabel) (\(entry.snapshot.streakDays)d)", systemImage: "flame.fill")
      }
    default:
      ZStack {
        Color(red: 0.04, green: 0.04, blue: 0.05)
        if let friend = entry.friend {
          VStack(spacing: 6) {
            Image(systemName: friend.flameIntensity > 0 ? "flame.fill" : "smoke.fill")
              .font(.largeTitle)
              .foregroundColor(friend.flameIntensity > 0 ? .orange : .gray)
            Text(friend.displayName)
              .font(.headline)
              .foregroundColor(.white)
            Text("\(friendStateLabel(friend)) • \(friend.streakDays)d")
              .font(.caption)
              .foregroundColor(.gray)
          }
        } else {
          VStack(spacing: 6) {
            Image(systemName: entry.snapshot.flameIntensity > 0 ? "flame.fill" : "smoke.fill")
              .font(.largeTitle)
              .foregroundColor(entry.snapshot.flameIntensity > 0 ? .orange : .gray)
            Text("Day \(entry.snapshot.streakDays)")
              .font(.headline)
              .foregroundColor(.white)
            Text("\(entry.snapshot.stepsToday) steps")
              .font(.caption)
              .foregroundColor(.gray)
          }
        }
      }
      .widgetURL(URL(string: entry.friend == nil ? "wick://home" : "wick://circle"))
    }
  }
}

struct WickCandleWidget: Widget {
  let kind: String = "WickCandleWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: WickProvider()) { entry in
      if #available(iOS 17.0, *) {
        WickWidgetView(entry: entry)
          .containerBackground(.black, for: .widget)
      } else {
        WickWidgetView(entry: entry)
      }
    }
    .configurationDisplayName("Wick Candle")
    .description("Your streak stays on the round widget. A paired friend's candle shows on the lock screen and Home Screen.")
    .supportedFamilies([
      .accessoryCircular,
      .accessoryRectangular,
      .accessoryInline,
      .systemSmall,
    ])
  }
}

@main
struct WickWidgetsBundle: WidgetBundle {
  var body: some Widget {
    WickCandleWidget()
  }
}
