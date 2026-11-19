import ExpoModulesCore
import Foundation
import WidgetKit
import CloudKit

public class WickNativeModule: Module {
  private let appGroupId = "group.com.senthilmkm.wick"
  private let containerId = "iCloud.com.senthilmkm.wick"
  private let zoneName = "WickCircleZone"
  private let recordType = "FriendCandleStatus"
  private let recordName = "myCandleStatus"
  private let resultsQueue = DispatchQueue(label: "com.senthilmkm.wick.ckResults")

  private lazy var container = CKContainer(identifier: containerId)
  private lazy var zoneID = CKRecordZone.ID(zoneName: zoneName, ownerName: CKCurrentUserDefaultName)

  public func definition() -> ModuleDefinition {
    Name("WickNative")

    Function("writeWidgetSnapshot") { (jsonPayload: String) in
      UserDefaults(suiteName: self.appGroupId)?.set(jsonPayload, forKey: "wick.widget.snapshot")
    }

    Function("reloadWidgets") {
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    AsyncFunction("isICloudSignedIn") { (promise: Promise) in
      self.container.accountStatus { status, _ in
        promise.resolve(status == .available)
      }
    }

    AsyncFunction("upsertOwnCandleRecord") {
      (displayName: String, state: String, flameIntensity: Double, streakDays: Int, updatedAt: Double, promise: Promise) in
      let privateDB = self.container.privateCloudDatabase
      let zone = CKRecordZone(zoneID: self.zoneID)
      privateDB.save(zone) { _, _ in
        let recID = CKRecord.ID(recordName: self.recordName, zoneID: self.zoneID)
        privateDB.fetch(withRecordID: recID) { existing, _ in
          let record = existing ?? CKRecord(recordType: self.recordType, recordID: recID)
          record["displayName"] = displayName as CKRecordValue
          record["state"] = state as CKRecordValue
          record["flameIntensity"] = flameIntensity as CKRecordValue
          record["streakDays"] = streakDays as CKRecordValue
          record["updatedAt"] = updatedAt as CKRecordValue
          privateDB.save(record) { _, error in
            if let error {
              promise.reject("CK_SAVE_ERR", error.localizedDescription)
            } else {
              promise.resolve(true)
            }
          }
        }
      }
    }

    AsyncFunction("createFriendShareUrl") { (promise: Promise) in
      let privateDB = self.container.privateCloudDatabase
      let zone = CKRecordZone(zoneID: self.zoneID)
      privateDB.save(zone) { _, _ in
        let recID = CKRecord.ID(recordName: self.recordName, zoneID: self.zoneID)
        privateDB.fetch(withRecordID: recID) { existing, _ in
          let root = existing ?? CKRecord(recordType: self.recordType, recordID: recID)
          if existing == nil {
            root["displayName"] = "Friend" as CKRecordValue
            root["state"] = "BLAZING" as CKRecordValue
            root["flameIntensity"] = 0.9 as CKRecordValue
            root["streakDays"] = 1 as CKRecordValue
            root["updatedAt"] = Date().timeIntervalSince1970 * 1000 as CKRecordValue
          }
          let share = CKShare(rootRecord: root)
          share[CKShare.SystemFieldKey.title] = "Wick Candle" as CKRecordValue
          share.publicPermission = .readOnly
          let op = CKModifyRecordsOperation(recordsToSave: [root, share], recordIDsToDelete: nil)
          op.modifyRecordsResultBlock = { result in
            switch result {
            case .success:
              promise.resolve(share.url?.absoluteString ?? "")
            case .failure(let err):
              promise.reject("CK_SHARE_ERR", err.localizedDescription)
            }
          }
          privateDB.add(op)
        }
      }
    }

    AsyncFunction("acceptFriendShareUrl") { (shareUrl: String, promise: Promise) in
      guard let url = URL(string: shareUrl) else {
        promise.resolve(false)
        return
      }
      self.container.fetchShareMetadata(with: url) { metadata, error in
        guard let metadata, error == nil else {
          promise.resolve(false)
          return
        }
        let op = CKAcceptSharesOperation(shareMetadatas: [metadata])
        op.acceptSharesResultBlock = { result in
          switch result {
          case .success:
            promise.resolve(true)
          case .failure:
            promise.resolve(false)
          }
        }
        self.container.add(op)
      }
    }

    AsyncFunction("fetchSharedFriendCandles") { (promise: Promise) in
      let sharedDB = self.container.sharedCloudDatabase
      let sub = CKDatabaseSubscription(subscriptionID: "wick-shared-circle-sub")
      let notifInfo = CKSubscription.NotificationInfo()
      notifInfo.shouldSendContentAvailable = true
      sub.notificationInfo = notifInfo
      sharedDB.save(sub) { _, _ in }

      sharedDB.fetchAllRecordZones { zones, error in
        if let error {
          promise.reject("CK_ZONES_ERR", error.localizedDescription)
          return
        }
        guard let zones, !zones.isEmpty else {
          promise.resolve([])
          return
        }
        var results: [[String: Any]] = []
        let group = DispatchGroup()
        for zone in zones {
          group.enter()
          let query = CKQuery(recordType: self.recordType, predicate: NSPredicate(value: true))
          sharedDB.fetch(withQuery: query, inZoneWith: zone.zoneID, desiredKeys: nil, resultsLimit: 20) { res in
            if case .success(let payload) = res {
              var zoneItems: [[String: Any]] = []
              for (recID, matchRes) in payload.matchResults {
                if case .success(let record) = matchRes {
                  zoneItems.append([
                    "id": recID.recordName,
                    "displayName": (record["displayName"] as? String) ?? "Friend",
                    "state": (record["state"] as? String) ?? "STEADY",
                    "flameIntensity": (record["flameIntensity"] as? Double) ?? 0.6,
                    "streakDays": (record["streakDays"] as? Int) ?? 0,
                    "updatedAt": (record["updatedAt"] as? Double) ?? 0,
                  ])
                }
              }
              self.resultsQueue.sync {
                results.append(contentsOf: zoneItems)
              }
            }
            group.leave()
          }
        }
        group.notify(queue: .main) {
          promise.resolve(results)
        }
      }
    }
  }
}
