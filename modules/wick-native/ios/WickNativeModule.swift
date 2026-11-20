import ExpoModulesCore
import Foundation
import WidgetKit
import CloudKit

public class WickNativeModule: Module {
  private let appGroupId = "group.com.senthilmkm.wick"
  private let containerId = "iCloud.com.senthilmkm.wick"
  private let zoneName = "WickCircleZone"
  private let recordType = "FriendCandleStatus"
  private let sparkRecordType = "SparkRequest"
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
        privateDB.fetch(withRecordID: recID) { existing, fetchError in
          if let ckErr = fetchError as? CKError, ckErr.code != .unknownItem {
            promise.reject("CK_FETCH_ERR", ckErr.localizedDescription)
            return
          } else if existing == nil, let fetchError, !(fetchError is CKError) {
            promise.reject("CK_FETCH_ERR", fetchError.localizedDescription)
            return
          }
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
        privateDB.fetch(withRecordID: recID) { existing, fetchError in
          if let ckErr = fetchError as? CKError, ckErr.code != .unknownItem {
            promise.reject("CK_FETCH_ERR", ckErr.localizedDescription)
            return
          } else if existing == nil, let fetchError, !(fetchError is CKError) {
            promise.reject("CK_FETCH_ERR", fetchError.localizedDescription)
            return
          }
          if let existingShareRef = existing?.share {
            privateDB.fetch(withRecordID: existingShareRef.recordID) { shareRecord, shareErr in
              if let shareErr {
                promise.reject("CK_SHARE_ERR", shareErr.localizedDescription)
              } else if let existingShare = shareRecord as? CKShare {
                promise.resolve(existingShare.url?.absoluteString ?? "")
              } else {
                promise.resolve("")
              }
            }
            return
          }
          let root = existing ?? CKRecord(recordType: self.recordType, recordID: recID)
          if existing == nil {
            root["displayName"] = "Friend" as CKRecordValue
            root["state"] = "BLAZING" as CKRecordValue
            root["flameIntensity"] = 0.9 as CKRecordValue
            root["streakDays"] = 1 as CKRecordValue
            root["updatedAt"] = NSNumber(value: Date().timeIntervalSince1970 * 1000)
          }
          let share = CKShare(rootRecord: root)
          share[CKShare.SystemFieldKey.title] = "Wick Candle" as CKRecordValue
          share.publicPermission = .readOnly
          var savedShareUrl: String?
          let op = CKModifyRecordsOperation(recordsToSave: [root, share], recordIDsToDelete: nil)
          op.perRecordSaveBlock = { _, saveResult in
            if case .success(let savedRecord) = saveResult, let savedShare = savedRecord as? CKShare {
              savedShareUrl = savedShare.url?.absoluteString
            }
          }
          op.modifyRecordsResultBlock = { result in
            switch result {
            case .success:
              promise.resolve(savedShareUrl ?? share.url?.absoluteString ?? "")
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
          self.resultsQueue.sync {
            promise.resolve(results)
          }
        }
      }
    }

    AsyncFunction("createSparkShareRecord") {
      (sparkId: String, senderName: String, stepsRequired: Int, expiresAt: Double, promise: Promise) in
      let privateDB = self.container.privateCloudDatabase
      let zone = CKRecordZone(zoneID: self.zoneID)
      privateDB.save(zone) { _, _ in
        let recID = CKRecord.ID(recordName: sparkId, zoneID: self.zoneID)
        let record = CKRecord(recordType: self.sparkRecordType, recordID: recID)
        record["sparkId"] = sparkId as CKRecordValue
        record["senderName"] = senderName as CKRecordValue
        record["status"] = "pending" as CKRecordValue
        record["stepsWalked"] = 0 as CKRecordValue
        record["stepsRequired"] = stepsRequired as CKRecordValue
        record["expiresAt"] = expiresAt as CKRecordValue
        record["completedAt"] = 0.0 as CKRecordValue

        let share = CKShare(rootRecord: record)
        share[CKShare.SystemFieldKey.title] = "Save \(senderName)'s Wick" as CKRecordValue
        share.publicPermission = .readWrite

        var savedShareUrl: String?
        let op = CKModifyRecordsOperation(recordsToSave: [record, share], recordIDsToDelete: nil)
        op.perRecordSaveBlock = { _, saveResult in
          if case .success(let savedRecord) = saveResult, let savedShare = savedRecord as? CKShare {
            savedShareUrl = savedShare.url?.absoluteString
          }
        }
        op.modifyRecordsResultBlock = { result in
          switch result {
          case .success:
            promise.resolve(savedShareUrl ?? share.url?.absoluteString ?? "")
          case .failure(let err):
            promise.reject("CK_SPARK_SHARE_ERR", err.localizedDescription)
          }
        }
        privateDB.add(op)
      }
    }

    AsyncFunction("acceptShareUrlWithKind") { (shareUrl: String, promise: Promise) in
      guard let url = URL(string: shareUrl) else {
        promise.resolve(["accepted": false, "kind": "unknown"])
        return
      }
      var fetchedMeta: CKShare.Metadata?
      let metaOp = CKFetchShareMetadataOperation(shareURLs: [url])
      metaOp.shouldFetchRootRecord = true
      metaOp.perShareMetadataResultBlock = { _, res in
        if case .success(let meta) = res {
          fetchedMeta = meta
        }
      }
      metaOp.fetchShareMetadataResultBlock = { result in
        guard case .success = result, let metadata = fetchedMeta else {
          promise.resolve(["accepted": false, "kind": "unknown"])
          return
        }
        let root = metadata.rootRecord
        let isSpark = root?.recordType == self.sparkRecordType
        var payload: [String: Any] = [
          "accepted": true,
          "kind": isSpark ? "spark" : "friend",
        ]
        if isSpark, let root {
          payload["sparkId"] = (root["sparkId"] as? String) ?? root.recordID.recordName
          payload["senderName"] = (root["senderName"] as? String) ?? "Friend"
          payload["stepsRequired"] = (root["stepsRequired"] as? Int) ?? 500
          payload["expiresAt"] = (root["expiresAt"] as? Double) ?? 0.0
        }
        let acceptOp = CKAcceptSharesOperation(shareMetadatas: [metadata])
        acceptOp.acceptSharesResultBlock = { acceptRes in
          switch acceptRes {
          case .success:
            promise.resolve(payload)
          case .failure:
            promise.resolve(["accepted": false, "kind": "unknown"])
          }
        }
        self.container.add(acceptOp)
      }
      self.container.add(metaOp)
    }

    AsyncFunction("completeSparkShareRecord") { (sparkId: String, stepsWalked: Int, promise: Promise) in
      let sharedDB = self.container.sharedCloudDatabase
      sharedDB.fetchAllRecordZones { zones, error in
        guard error == nil, let zones, !zones.isEmpty else {
          promise.resolve(false)
          return
        }
        let group = DispatchGroup()
        var updatedAny = false
        for zone in zones {
          group.enter()
          let pred = NSPredicate(format: "sparkId == %@", sparkId)
          let query = CKQuery(recordType: self.sparkRecordType, predicate: pred)
          sharedDB.fetch(withQuery: query, inZoneWith: zone.zoneID, desiredKeys: nil, resultsLimit: 5) { res in
            if case .success(let payload) = res {
              var toSave: [CKRecord] = []
              for (_, matchRes) in payload.matchResults {
                if case .success(let record) = matchRes {
                  record["status"] = "completed" as CKRecordValue
                  record["stepsWalked"] = stepsWalked as CKRecordValue
                  record["completedAt"] = NSNumber(value: Date().timeIntervalSince1970 * 1000)
                  toSave.append(record)
                }
              }
              if !toSave.isEmpty {
                let saveOp = CKModifyRecordsOperation(recordsToSave: toSave, recordIDsToDelete: nil)
                saveOp.modifyRecordsResultBlock = { saveRes in
                  if case .success = saveRes {
                    self.resultsQueue.sync { updatedAny = true }
                  }
                  group.leave()
                }
                sharedDB.add(saveOp)
                return
              }
            }
            group.leave()
          }
        }
        group.notify(queue: .main) {
          self.resultsQueue.sync {
            promise.resolve(updatedAny)
          }
        }
      }
    }

    AsyncFunction("checkPendingSparkRescues") { (promise: Promise) in
      let privateDB = self.container.privateCloudDatabase
      let pred = NSPredicate(format: "status == %@", "completed")
      let query = CKQuery(recordType: self.sparkRecordType, predicate: pred)
      privateDB.fetch(withQuery: query, inZoneWith: self.zoneID, desiredKeys: nil, resultsLimit: 20) { res in
        guard case .success(let payload) = res else {
          promise.resolve([])
          return
        }
        var sparkIds: [String] = []
        var toDelete: [CKRecord.ID] = []
        for (recID, matchRes) in payload.matchResults {
          if case .success(let record) = matchRes {
            let sid = (record["sparkId"] as? String) ?? recID.recordName
            sparkIds.append(sid)
            toDelete.append(recID)
          }
        }
        if toDelete.isEmpty {
          promise.resolve([])
          return
        }
        let delOp = CKModifyRecordsOperation(recordsToSave: nil, recordIDsToDelete: toDelete)
        delOp.modifyRecordsResultBlock = { _ in
          promise.resolve(sparkIds)
        }
        privateDB.add(delOp)
      }
    }
  }
}
