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

struct WickEntry: TimelineEntry {
  let date: Date
  let snapshot: WickWidgetSnapshot
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
    WickEntry(date: Date(), snapshot: Self.placeholderSnapshot)
  }

  func getSnapshot(in context: Context, completion: @escaping (WickEntry) -> Void) {
    completion(loadEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<WickEntry>) -> Void) {
    let entry = loadEntry()
    let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
    completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
  }

  private func loadEntry() -> WickEntry {
    guard
      let data = UserDefaults(suiteName: appGroupId)?.string(forKey: "wick.widget.snapshot")?.data(using: .utf8),
      let decoded = try? JSONDecoder().decode(WickWidgetSnapshot.self, from: data)
    else {
      return WickEntry(date: Date(), snapshot: Self.uninitializedSnapshot)
    }
    return WickEntry(date: Date(), snapshot: decoded)
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
    case .accessoryInline:
      Label("Wick: \(stateLabel) (\(entry.snapshot.streakDays)d)", systemImage: "flame.fill")
    default:
      ZStack {
        Color(red: 0.04, green: 0.04, blue: 0.05)
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
      .widgetURL(URL(string: "wick://home"))
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
    .description("See your living candle flame and daily streak right on your Lock Screen.")
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
