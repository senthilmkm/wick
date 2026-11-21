import ExpoModulesCore
import Foundation
import WidgetKit
import CloudKit
import Intents

public class WickNativeModule: Module {
  private let appGroupId = "group.com.senthilmkm.wick"
  private let containerId = "iCloud.com.senthilmkm.wick"
  private let zoneName = "WickCircleZone"
  private let recordType = "FriendCandleStatus"
  private let sparkRecordType = "SparkRequest"
  private let trialRecordType = "WickTrialAnchor"
  private let trialRecordName = "trialAnchor"
  private let recordName = "myCandleStatus"

  private final class LockedBox<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var _value: T
    init(_ value: T) { _value = value }
    func withLock<R>(_ body: (inout T) -> R) -> R {
      lock.lock()
      defer { lock.unlock() }
      return body(&_value)
    }
  }

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
          let savedShareUrl = LockedBox<String?>(nil)
          let op = CKModifyRecordsOperation(recordsToSave: [root, share], recordIDsToDelete: nil)
          op.perRecordSaveBlock = { _, saveResult in
            if case .success(let savedRecord) = saveResult, let savedShare = savedRecord as? CKShare {
              let urlStr = savedShare.url?.absoluteString
              savedShareUrl.withLock { $0 = urlStr }
            }
          }
          op.modifyRecordsResultBlock = { result in
            switch result {
            case .success:
              let resolved = savedShareUrl.withLock { $0 } ?? share.url?.absoluteString ?? ""
              promise.resolve(resolved)
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
        let results = LockedBox<[[String: Any]]>([])
        let zoneIDs = zones.map { $0.zoneID }
        let fetchOp = CKFetchRecordZoneChangesOperation(recordZoneIDs: zoneIDs, configurationsByRecordZoneID: nil)
        fetchOp.recordWasChangedBlock = { recID, res in
          if case .success(let record) = res, record.recordType == self.recordType {
            let item: [String: Any] = [
              "id": "\(recID.zoneID.ownerName):\(recID.recordName)",
              "displayName": (record["displayName"] as? String) ?? "Friend",
              "state": (record["state"] as? String) ?? "STEADY",
              "flameIntensity": (record["flameIntensity"] as? Double) ?? 0.6,
              "streakDays": (record["streakDays"] as? Int) ?? 0,
              "updatedAt": (record["updatedAt"] as? Double) ?? 0,
            ]
            results.withLock { $0.append(item) }
          }
        }
        fetchOp.fetchRecordZoneChangesResultBlock = { _ in
          promise.resolve(results.withLock { $0 })
        }
        sharedDB.add(fetchOp)
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
        share.publicPermission = .readOnly

        let savedShareUrl = LockedBox<String?>(nil)
        let op = CKModifyRecordsOperation(recordsToSave: [record, share], recordIDsToDelete: nil)
        op.perRecordSaveBlock = { _, saveResult in
          if case .success(let savedRecord) = saveResult, let savedShare = savedRecord as? CKShare {
            let urlStr = savedShare.url?.absoluteString
            savedShareUrl.withLock { $0 = urlStr }
          }
        }
        op.modifyRecordsResultBlock = { result in
          switch result {
          case .success:
            let resolved = savedShareUrl.withLock { $0 } ?? share.url?.absoluteString ?? ""
            promise.resolve(resolved)
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
      let fetchedMeta = LockedBox<CKShare.Metadata?>(nil)
      let metaOp = CKFetchShareMetadataOperation(shareURLs: [url])
      metaOp.shouldFetchRootRecord = true
      metaOp.perShareMetadataResultBlock = { _, res in
        if case .success(let meta) = res {
          fetchedMeta.withLock { $0 = meta }
        }
      }
      metaOp.fetchShareMetadataResultBlock = { result in
        guard case .success = result, let metadata = fetchedMeta.withLock({ $0 }) else {
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
      guard stepsWalked >= 500 else {
        promise.resolve(false)
        return
      }
      let sharedDB = self.container.sharedCloudDatabase
      sharedDB.fetchAllRecordZones { zones, error in
        guard error == nil, let zones, !zones.isEmpty else {
          promise.resolve(false)
          return
        }
        let group = DispatchGroup()
        let updatedAny = LockedBox(false)
        for zone in zones {
          group.enter()
          let recID = CKRecord.ID(recordName: sparkId, zoneID: zone.zoneID)
          sharedDB.fetch(withRecordID: recID) { record, fetchError in
            guard fetchError == nil, let record else {
              group.leave()
              return
            }
            record["status"] = "completed" as CKRecordValue
            record["stepsWalked"] = stepsWalked as CKRecordValue
            record["completedAt"] = NSNumber(value: Date().timeIntervalSince1970 * 1000)
            let saveOp = CKModifyRecordsOperation(recordsToSave: [record], recordIDsToDelete: nil)
            saveOp.modifyRecordsResultBlock = { saveRes in
              if case .success = saveRes {
                updatedAny.withLock { $0 = true }
              }
              group.leave()
            }
            sharedDB.add(saveOp)
          }
        }
        group.notify(queue: .main) {
          promise.resolve(updatedAny.withLock { $0 })
        }
      }
    }

    AsyncFunction("checkPendingSparkRescues") { (promise: Promise) in
      let privateDB = self.container.privateCloudDatabase
      let completedRescues = LockedBox<[[String: Any]]>([])
      let toDelete = LockedBox<[CKRecord.ID]>([])
      let fetchOp = CKFetchRecordZoneChangesOperation(recordZoneIDs: [self.zoneID], configurationsByRecordZoneID: nil)
      fetchOp.recordWasChangedBlock = { recID, res in
        if case .success(let record) = res,
           record.recordType == self.sparkRecordType,
           (record["status"] as? String) == "completed" {
          let sid = (record["sparkId"] as? String) ?? recID.recordName
          let walked = (record["stepsWalked"] as? Int) ?? 0
          completedRescues.withLock {
            $0.append(["sparkId": sid, "stepsWalked": walked])
          }
          toDelete.withLock { $0.append(recID) }
        }
      }
      fetchOp.fetchRecordZoneChangesResultBlock = { result in
        guard case .success = result else {
          promise.resolve([])
          return
        }
        let idsToDelete = toDelete.withLock { $0 }
        let rescues = completedRescues.withLock { $0 }
        if idsToDelete.isEmpty {
          promise.resolve([])
          return
        }
        let delOp = CKModifyRecordsOperation(recordsToSave: nil, recordIDsToDelete: idsToDelete)
        delOp.modifyRecordsResultBlock = { _ in
          promise.resolve(rescues)
        }
        privateDB.add(delOp)
      }
      privateDB.add(fetchOp)
    }

    AsyncFunction("peekShareUrlKind") { (shareUrl: String, promise: Promise) in
      guard let url = URL(string: shareUrl) else {
        promise.resolve(["accepted": false, "kind": "unknown"])
        return
      }
      let fetchedMeta = LockedBox<CKShare.Metadata?>(nil)
      let metaOp = CKFetchShareMetadataOperation(shareURLs: [url])
      metaOp.shouldFetchRootRecord = true
      metaOp.perShareMetadataResultBlock = { _, res in
        if case .success(let meta) = res {
          fetchedMeta.withLock { $0 = meta }
        }
      }
      metaOp.fetchShareMetadataResultBlock = { result in
        guard case .success = result, let metadata = fetchedMeta.withLock({ $0 }) else {
          promise.resolve(["accepted": false, "kind": "unknown"])
          return
        }
        let root = metadata.rootRecord
        let isSpark = root?.recordType == self.sparkRecordType
        var payload: [String: Any] = [
          "accepted": false,
          "kind": isSpark ? "spark" : "friend",
        ]
        if isSpark, let root {
          payload["sparkId"] = (root["sparkId"] as? String) ?? root.recordID.recordName
          payload["senderName"] = (root["senderName"] as? String) ?? "Friend"
          payload["stepsRequired"] = (root["stepsRequired"] as? Int) ?? 500
          payload["expiresAt"] = (root["expiresAt"] as? Double) ?? 0.0
        }
        promise.resolve(payload)
      }
      self.container.add(metaOp)
    }

    AsyncFunction("fetchOrCreateTrialAnchor") { (promise: Promise) in
      let privateDB = self.container.privateCloudDatabase
      let zone = CKRecordZone(zoneID: self.zoneID)
      privateDB.save(zone) { _, _ in
        let recID = CKRecord.ID(recordName: self.trialRecordName, zoneID: self.zoneID)
        privateDB.fetch(withRecordID: recID) { existing, error in
          if let existing {
            self.touchTrialAnchor(existing, db: privateDB, promise: promise)
            return
          }
          if let ckErr = error as? CKError, ckErr.code != .unknownItem {
            promise.resolve([:] as [String: Any])
            return
          }
          if existing == nil, error != nil, !(error is CKError) {
            promise.resolve([:] as [String: Any])
            return
          }
          let created = CKRecord(recordType: self.trialRecordType, recordID: recID)
          created["expired"] = 0 as CKRecordValue
          privateDB.save(created) { saved, saveError in
            if let saved, saveError == nil {
              promise.resolve(self.trialPayload(saved))
            } else {
              promise.resolve([:] as [String: Any])
            }
          }
        }
      }
    }

    AsyncFunction("markTrialAnchorExpired") { (promise: Promise) in
      let privateDB = self.container.privateCloudDatabase
      let recID = CKRecord.ID(recordName: self.trialRecordName, zoneID: self.zoneID)
      privateDB.fetch(withRecordID: recID) { existing, error in
        guard let existing, error == nil else {
          promise.resolve(false)
          return
        }
        existing["expired"] = 1 as CKRecordValue
        privateDB.save(existing) { _, saveError in
          promise.resolve(saveError == nil)
        }
      }
    }

    AsyncFunction("isSleepFocusActive") { (promise: Promise) in
      if #available(iOS 15.0, *) {
        let center = INFocusStatusCenter.default
        if center.authorizationStatus == .authorized {
          promise.resolve(center.focusStatus.isFocused)
          return
        }
      }
      promise.resolve(false)
    }
  }

  private func trialPayload(_ record: CKRecord) -> [String: Any] {
    let created = (record.creationDate?.timeIntervalSince1970 ?? 0) * 1000
    let modified = (record.modificationDate?.timeIntervalSince1970 ?? 0) * 1000
    let expired = (record["expired"] as? NSNumber)?.intValue == 1
    return [
      "createdAtMs": created,
      "serverNowMs": modified > 0 ? modified : created,
      "expired": expired,
    ]
  }

  private func touchTrialAnchor(_ record: CKRecord, db: CKDatabase, promise: Promise) {
    record["ping"] = NSNumber(value: Date().timeIntervalSince1970)
    db.save(record) { saved, error in
      if let saved, error == nil {
        promise.resolve(self.trialPayload(saved))
      } else {
        promise.resolve(self.trialPayload(record))
      }
    }
  }
}
