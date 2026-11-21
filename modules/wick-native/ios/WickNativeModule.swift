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

  private func candlePayload(_ record: CKRecord, id: String) -> [String: Any] {
    [
      "id": id,
      "displayName": (record["displayName"] as? String) ?? "Friend",
      "state": (record["state"] as? String) ?? "STEADY",
      "flameIntensity": (record["flameIntensity"] as? Double) ?? 0.6,
      "streakDays": (record["streakDays"] as? Int) ?? 0,
      "updatedAt": (record["updatedAt"] as? Double) ?? 0,
    ]
  }

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

    Function("writeFriendWidgetSnapshot") { (jsonPayload: String) in
      let defaults = UserDefaults(suiteName: self.appGroupId)
      if jsonPayload.isEmpty {
        defaults?.removeObject(forKey: "wick.widget.friend")
      } else {
        defaults?.set(jsonPayload, forKey: "wick.widget.friend")
      }
    }

    AsyncFunction("createFriendShareUrl") {
      (displayName: String, state: String, flameIntensity: Double, streakDays: Int, promise: Promise) in
      let privateDB = self.container.privateCloudDatabase
      let zone = CKRecordZone(zoneID: self.zoneID)
      privateDB.save(zone) { _, _ in
        let shareID = CKRecord.ID(recordName: CKRecordNameZoneWideShare, zoneID: self.zoneID)
        privateDB.fetch(withRecordID: shareID) { existingShare, _ in
          if let share = existingShare as? CKShare, let url = share.url?.absoluteString, !url.isEmpty {
            promise.resolve(url)
            return
          }
          let recID = CKRecord.ID(recordName: self.recordName, zoneID: self.zoneID)
          privateDB.fetch(withRecordID: recID) { existing, _ in
            let root = existing ?? CKRecord(recordType: self.recordType, recordID: recID)
            if existing == nil {
              let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
              root["displayName"] = (name.isEmpty ? "Wick" : name) as CKRecordValue
              root["state"] = state as CKRecordValue
              root["flameIntensity"] = flameIntensity as CKRecordValue
              root["streakDays"] = streakDays as CKRecordValue
              root["updatedAt"] = NSNumber(value: Date().timeIntervalSince1970 * 1000)
            }
            let share = CKShare(recordZoneID: self.zoneID)
            share.publicPermission = .readWrite
            let titleName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
            share[CKShare.SystemFieldKey.title] = "\(titleName.isEmpty ? "Wick" : titleName)'s Wick Circle" as CKRecordValue
            let savedShareUrl = LockedBox<String?>(nil)
            let op = CKModifyRecordsOperation(recordsToSave: [root, share], recordIDsToDelete: nil)
            op.perRecordSaveBlock = { _, saveResult in
              if case .success(let savedRecord) = saveResult, let savedShare = savedRecord as? CKShare {
                savedShareUrl.withLock { $0 = savedShare.url?.absoluteString }
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
      let privateDB = self.container.privateCloudDatabase
      let sub = CKDatabaseSubscription(subscriptionID: "wick-shared-circle-sub")
      let notifInfo = CKSubscription.NotificationInfo()
      notifInfo.shouldSendContentAvailable = true
      sub.notificationInfo = notifInfo
      sharedDB.save(sub) { _, _ in }

      let results = LockedBox<[[String: Any]]>([])
      let group = DispatchGroup()

      group.enter()
      sharedDB.fetchAllRecordZones { zones, error in
        guard error == nil, let zones, !zones.isEmpty else {
          group.leave()
          return
        }
        let fetchOp = CKFetchRecordZoneChangesOperation(recordZoneIDs: zones.map { $0.zoneID }, configurationsByRecordZoneID: nil)
        fetchOp.recordWasChangedBlock = { recID, res in
          if case .success(let record) = res,
             record.recordType == self.recordType,
             !recID.recordName.hasPrefix("visitor_") {
            results.withLock { $0.append(self.candlePayload(record, id: "\(recID.zoneID.ownerName):\(recID.recordName)")) }
          }
        }
        fetchOp.fetchRecordZoneChangesResultBlock = { _ in
          group.leave()
        }
        sharedDB.add(fetchOp)
      }

      group.enter()
      let privateFetch = CKFetchRecordZoneChangesOperation(recordZoneIDs: [self.zoneID], configurationsByRecordZoneID: nil)
      privateFetch.recordWasChangedBlock = { recID, res in
        if case .success(let record) = res,
           record.recordType == self.recordType,
           recID.recordName.hasPrefix("visitor_") {
          results.withLock { $0.append(self.candlePayload(record, id: "\(recID.zoneID.ownerName):\(recID.recordName)")) }
        }
      }
      privateFetch.fetchRecordZoneChangesResultBlock = { _ in
        group.leave()
      }
      privateDB.add(privateFetch)

      group.notify(queue: .main) {
        promise.resolve(results.withLock { $0 })
      }
    }

    AsyncFunction("publishVisitorCandle") {
      (visitorId: String, displayName: String, state: String, flameIntensity: Double, streakDays: Int, updatedAt: Double, promise: Promise) in
      let trimmed = visitorId.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty else {
        promise.resolve(false)
        return
      }
      let recordName = "visitor_\(trimmed)"
      let sharedDB = self.container.sharedCloudDatabase
      sharedDB.fetchAllRecordZones { zones, error in
        guard error == nil, let zones, !zones.isEmpty else {
          promise.resolve(false)
          return
        }
        let group = DispatchGroup()
        let wrote = LockedBox(false)
        for zone in zones {
          group.enter()
          let recID = CKRecord.ID(recordName: recordName, zoneID: zone.zoneID)
          sharedDB.fetch(withRecordID: recID) { existing, _ in
            let record = existing ?? CKRecord(recordType: self.recordType, recordID: recID)
            let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
            record["displayName"] = (name.isEmpty ? "Wick" : name) as CKRecordValue
            record["state"] = state as CKRecordValue
            record["flameIntensity"] = flameIntensity as CKRecordValue
            record["streakDays"] = streakDays as CKRecordValue
            record["updatedAt"] = updatedAt as CKRecordValue
            sharedDB.save(record) { _, saveError in
              if saveError == nil {
                wrote.withLock { $0 = true }
              }
              group.leave()
            }
          }
        }
        group.notify(queue: .main) {
          promise.resolve(wrote.withLock { $0 })
        }
      }
    }

    AsyncFunction("createSparkShareRecord") {
      (sparkId: String, senderName: String, stepsRequired: Int, expiresAt: Double, promise: Promise) in
      let privateDB = self.container.privateCloudDatabase
      let zone = CKRecordZone(zoneID: self.zoneID)
      privateDB.save(zone) { _, _ in
        let shareID = CKRecord.ID(recordName: CKRecordNameZoneWideShare, zoneID: self.zoneID)
        privateDB.fetch(withRecordID: shareID) { zoneShare, _ in
          let zoneURL = (zoneShare as? CKShare)?.url?.absoluteString
          let recID = CKRecord.ID(recordName: sparkId, zoneID: self.zoneID)
          let record = CKRecord(recordType: self.sparkRecordType, recordID: recID)
          record["sparkId"] = sparkId as CKRecordValue
          record["senderName"] = senderName as CKRecordValue
          record["status"] = "pending" as CKRecordValue
          record["stepsWalked"] = 0 as CKRecordValue
          record["stepsRequired"] = stepsRequired as CKRecordValue
          record["expiresAt"] = expiresAt as CKRecordValue
          record["completedAt"] = 0.0 as CKRecordValue
          if let zoneURL, !zoneURL.isEmpty {
            privateDB.save(record) { _, error in
              if error != nil {
                promise.reject("CK_SPARK_SHARE_ERR", error?.localizedDescription ?? "save failed")
              } else {
                promise.resolve(["delivery": "circle"])
              }
            }
            return
          }
          let share = CKShare(rootRecord: record)
          share[CKShare.SystemFieldKey.title] = "Save \(senderName)'s Wick" as CKRecordValue
          share.publicPermission = .readWrite
          let savedShareUrl = LockedBox<String?>(nil)
          let op = CKModifyRecordsOperation(recordsToSave: [record, share], recordIDsToDelete: nil)
          op.perRecordSaveBlock = { _, saveResult in
            if case .success(let savedRecord) = saveResult, let savedShare = savedRecord as? CKShare {
              savedShareUrl.withLock { $0 = savedShare.url?.absoluteString }
            }
          }
          op.modifyRecordsResultBlock = { result in
            switch result {
            case .success:
              let resolved = savedShareUrl.withLock { $0 } ?? share.url?.absoluteString ?? ""
              if resolved.isEmpty {
                promise.reject("CK_SPARK_SHARE_ERR", "missing share url")
              } else {
                promise.resolve(["delivery": "link", "shareUrl": resolved])
              }
            case .failure(let err):
              promise.reject("CK_SPARK_SHARE_ERR", err.localizedDescription)
            }
          }
          privateDB.add(op)
        }
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
        }
      }
      fetchOp.fetchRecordZoneChangesResultBlock = { result in
        guard case .success = result else {
          promise.resolve([])
          return
        }
        promise.resolve(completedRescues.withLock { $0 })
      }
      privateDB.add(fetchOp)
    }

    AsyncFunction("fetchSharedPendingSparks") { (promise: Promise) in
      let sharedDB = self.container.sharedCloudDatabase
      sharedDB.fetchAllRecordZones { zones, error in
        guard error == nil, let zones, !zones.isEmpty else {
          promise.resolve([])
          return
        }
        let pending = LockedBox<[[String: Any]]>([])
        let fetchOp = CKFetchRecordZoneChangesOperation(recordZoneIDs: zones.map { $0.zoneID }, configurationsByRecordZoneID: nil)
        fetchOp.recordWasChangedBlock = { recID, res in
          if case .success(let record) = res,
             record.recordType == self.sparkRecordType,
             (record["status"] as? String) == "pending" {
            let sid = (record["sparkId"] as? String) ?? recID.recordName
            pending.withLock {
              $0.append([
                "sparkId": sid,
                "senderName": (record["senderName"] as? String) ?? "Friend",
                "stepsRequired": (record["stepsRequired"] as? Int) ?? 500,
                "expiresAt": (record["expiresAt"] as? Double) ?? 0,
              ])
            }
          }
        }
        fetchOp.fetchRecordZoneChangesResultBlock = { result in
          guard case .success = result else {
            promise.resolve([])
            return
          }
          promise.resolve(pending.withLock { $0 })
        }
        sharedDB.add(fetchOp)
      }
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

    AsyncFunction("deleteCompletedSparkRecords") { (sparkIds: [String], promise: Promise) in
      let ids = sparkIds.map { CKRecord.ID(recordName: $0, zoneID: self.zoneID) }
      guard !ids.isEmpty else {
        promise.resolve(false)
        return
      }
      let op = CKModifyRecordsOperation(recordsToSave: nil, recordIDsToDelete: ids)
      op.modifyRecordsResultBlock = { result in
        if case .success = result {
          promise.resolve(true)
        } else {
          promise.resolve(false)
        }
      }
      self.container.privateCloudDatabase.add(op)
    }

    AsyncFunction("sendNudge") {
      (ownerName: String, nudgeId: String, fromName: String, message: String, createdAt: Double, promise: Promise) in
      let zoneID = CKRecordZone.ID(zoneName: self.zoneName, ownerName: ownerName)
      let recID = CKRecord.ID(recordName: nudgeId, zoneID: zoneID)
      let record = CKRecord(recordType: "NudgeEvent", recordID: recID)
      record["nudgeId"] = nudgeId as CKRecordValue
      record["fromName"] = fromName as CKRecordValue
      record["message"] = message as CKRecordValue
      record["createdAt"] = createdAt as CKRecordValue
      self.container.sharedCloudDatabase.save(record) { _, error in
        promise.resolve(error == nil)
      }
    }

    AsyncFunction("fetchNudges") { (promise: Promise) in
      let privateDB = self.container.privateCloudDatabase
      let nudges = LockedBox<[[String: Any]]>([])
      let fetchOp = CKFetchRecordZoneChangesOperation(recordZoneIDs: [self.zoneID], configurationsByRecordZoneID: nil)
      fetchOp.recordWasChangedBlock = { recID, res in
        if case .success(let record) = res, record.recordType == "NudgeEvent" {
          nudges.withLock {
            $0.append([
              "nudgeId": (record["nudgeId"] as? String) ?? recID.recordName,
              "fromName": (record["fromName"] as? String) ?? "A friend",
              "message": (record["message"] as? String) ?? "Keep your wick lit.",
              "createdAt": (record["createdAt"] as? Double) ?? 0,
            ])
          }
        }
      }
      fetchOp.fetchRecordZoneChangesResultBlock = { result in
        guard case .success = result else {
          promise.resolve([])
          return
        }
        promise.resolve(nudges.withLock { $0 })
      }
      privateDB.add(fetchOp)
    }

    AsyncFunction("deleteNudgeRecords") { (nudgeIds: [String], promise: Promise) in
      let ids = nudgeIds.map { CKRecord.ID(recordName: $0, zoneID: self.zoneID) }
      guard !ids.isEmpty else {
        promise.resolve(false)
        return
      }
      let op = CKModifyRecordsOperation(recordsToSave: nil, recordIDsToDelete: ids)
      op.modifyRecordsResultBlock = { result in
        if case .success = result {
          promise.resolve(true)
        } else {
          promise.resolve(false)
        }
      }
      self.container.privateCloudDatabase.add(op)
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
