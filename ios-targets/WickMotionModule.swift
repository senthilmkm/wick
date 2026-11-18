import Foundation
import HealthKit
import CoreMotion
import WidgetKit

@objc(WickMotionModule)
final class WickMotionModule: NSObject {
  private let healthStore = HKHealthStore()
  private let pedometer = CMPedometer()
  private let appGroupId = "group.com.wick.app"

  @objc func enableBackgroundStepObserver(_ resolve: @escaping (Any?) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    guard let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
      resolve(false)
      return
    }

    let query = HKObserverQuery(sampleType: stepType, predicate: nil) { [weak self] _, completionHandler, error in
      defer { completionHandler() }
      guard error == nil, let self else { return }
      self.queryTodaySteps { steps in
        UserDefaults(suiteName: self.appGroupId)?.set(steps, forKey: "wick.hk.stepsToday")
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    healthStore.execute(query)
    healthStore.enableBackgroundDelivery(for: stepType, frequency: .immediate) { success, _ in
      resolve(success)
    }
  }

  private func queryTodaySteps(completion: @escaping (Double) -> Void) {
    guard let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
      completion(0)
      return
    }
    let startOfDay = Calendar.current.startOfDay(for: Date())
    let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: Date(), options: .strictStartDate)
    let statsQuery = HKStatisticsQuery(quantityType: stepType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, _ in
      let steps = result?.sumQuantity()?.doubleValue(for: .count()) ?? 0
      completion(steps)
    }
    healthStore.execute(statsQuery)
  }
}
