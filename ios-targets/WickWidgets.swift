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
  private let appGroupId = "group.com.wick.app"

  func placeholder(in context: Context) -> WickEntry {
    WickEntry(date: Date(), snapshot: WickWidgetSnapshot(
      state: "BLAZING", flameIntensity: 0.9, flameColorHex: "#FFF6D6",
      stepsToday: 6420, expectedStepsNow: 5800, streakDays: 14
    ))
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
      return placeholder(in: .init())
    }
    return WickEntry(date: Date(), snapshot: decoded)
  }
}

struct WickWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: WickEntry

  var body: some View {
    switch family {
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        VStack(spacing: 2) {
          Image(systemName: "flame.fill")
          Text("\(entry.snapshot.streakDays)d")
            .font(.caption2.bold())
        }
      }
    case .accessoryRectangular:
      HStack(spacing: 8) {
        Image(systemName: "flame.fill")
          .font(.title3)
        VStack(alignment: .leading) {
          Text("Wick • \(entry.snapshot.state.capitalized)")
            .font(.headline)
          Text("\(entry.snapshot.stepsToday) steps • \(entry.snapshot.streakDays)d streak")
            .font(.caption2)
        }
      }
    case .accessoryInline:
      Label("Wick: \(entry.snapshot.state.capitalized) (\(entry.snapshot.streakDays)d)", systemImage: "flame.fill")
    default:
      ZStack {
        Color(red: 0.04, green: 0.04, blue: 0.05)
        VStack(spacing: 6) {
          Image(systemName: "flame.fill")
            .font(.largeTitle)
            .foregroundColor(.orange)
          Text("Day \(entry.snapshot.streakDays)")
            .font(.headline)
            .foregroundColor(.white)
          Text("\(entry.snapshot.stepsToday) steps")
            .font(.caption)
            .foregroundColor(.gray)
        }
      }
    }
  }
}
