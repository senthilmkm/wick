# Wick v1.2 Design: 1-Tap In-App Nudge & Spark Between Paired Friends

## 1. Goal
Eliminate the iOS Share Sheet step when interacting with **already-paired friends** in the Circle tab:
- **1-Tap Nudge:** Tapping **Nudge** on a paired friend's row sends an in-app nudge directly via CloudKit Shared DB and shows instant confirmation (`"Nudge sent to Maya"`).
- **1-Tap Ask for Spark (Paired Circle):** Tapping **Ask for Spark** can either broadcast a 500-step `SparkRequest` directly into your shared `WickCircleZone` for paired friends **or** fall back to the Share Sheet link for friends not yet paired.

---

## 2. CloudKit Architecture Changes

### A. Upgrade Pairing to Zone-Wide `.readWrite` `CKShare`
Currently (`v1.0`), `createFriendShareUrl()` creates a **record-level** `CKShare(rootRecord: myCandleStatus)` with `publicPermission = .readOnly`.

For `v1.2`, switch `createFriendShareUrl()` in `modules/wick-native/ios/WickNativeModule.swift` to a **zone-wide `CKShare`**:
- `let share = CKShare(recordZoneID: self.zoneID)` (available iOS 15.0+)
- `share.publicPermission = .readWrite`
- `share[CKShare.SystemFieldKey.title] = "\(displayName)'s Wick Circle" as CKRecordValue`

**Why zone-wide `.readWrite`?**
Any friend who accepts your zone share automatically gains access to:
1. Read your `FriendCandleStatus` record
2. Write `NudgeEvent` records into your `WickCircleZone`
3. Read new `SparkRequest` records you create in your `WickCircleZone` (without needing a second Share Sheet URL!) and mark them `status = "completed"` once they walk 500 steps.

> **Important Guardrail:** Because `.readWrite` allows participants to write in the shared zone, never overwrite `FriendCandleStatus` from the friend's side — only write `NudgeEvent` records and update `SparkRequest` (`status`, `stepsWalked`, `completedAt`).

### B. CloudKit Schema (`iCloud.com.senthilmkm.wick`)
Keep `FriendCandleStatus` and `SparkRequest`, and add one new record type:

| Record Type | Field | Type | Notes |
|---|---|---|---|
| `NudgeEvent` | `nudgeId` | `String` | `nudge_<timestamp>` |
| `NudgeEvent` | `fromName` | `String` | Sender's `candleName` |
| `NudgeEvent` | `message` | `String` | Short cheer message |
| `NudgeEvent` | `createdAt` | `Double` | Epoch ms |

**Deployment Note:** Before TestFlight/Production, deploy `NudgeEvent` from **Development -> Production** in Apple's CloudKit Console (`icloud.developer.apple.com`). Continue using `CKFetchRecordZoneChangesOperation` + `fetch(withRecordID:)` so **no `CKQuery` indexes** are needed.

---

## 3. Native Swift Changes (`WickNativeModule.swift`)

Add/update these Expo Module functions:

1. **`createFriendShareUrl` (updated)**
   - Ensure `WickCircleZone` and `myCandleStatus` exist.
   - Check if a zone-wide `CKShare` (`CKRecordZone.ID` share) already exists; if not, create `CKShare(recordZoneID: self.zoneID)` with `.readWrite` and save it.

2. **`sendInAppNudge(friendZoneOwnerName: String, fromName: String, message: String) -> Promise<Bool>`**
   - Look up the matching `CKRecordZone.ID(zoneName: "WickCircleZone", ownerName: friendZoneOwnerName)` in `sharedCloudDatabase`.
   - Save a `NudgeEvent` record (`recordName = "nudge_\(Int(Date().timeIntervalSince1970 * 1000))"`) into that friend's shared zone.

3. **`checkIncomingNudges() -> Promise<[[String: Any]]>`**
   - Run `CKFetchRecordZoneChangesOperation` on `privateCloudDatabase` (`WickCircleZone`).
   - Collect all `NudgeEvent` records, return `[{ nudgeId, fromName, message, createdAt }]`, and immediately delete them with `CKModifyRecordsOperation` so they are delivered once.

4. **`fetchSharedPendingSparks() -> Promise<[[String: Any]]>`**
   - Run `CKFetchRecordZoneChangesOperation` across `sharedCloudDatabase` zones.
   - Return any `SparkRequest` records where `status == "pending"` and `expiresAt > nowMs`, so paired friends automatically see your SOS Spark banner in their Circle tab without tapping a link.

---

## 4. JS / UI Changes

1. **[`src/services/nativeCloudBridge.ts`](src/services/nativeCloudBridge.ts)**
   - Add typed optional wrappers:
     - `sendNativeInAppNudge(friendZoneOwnerName, fromName, message)`
     - `checkNativeIncomingNudges()`
     - `fetchNativeSharedPendingSparks()`
2. **[`src/services/cloudKitService.ts`](src/services/cloudKitService.ts)**
   - Enforce a **5-minute per-friend nudge cooldown** in memory/MMKV so repeated taps don't spam CloudKit.
3. **[`src/screens/CircleScreen.tsx`](src/screens/CircleScreen.tsx)**
   - When `friend.id` contains a CloudKit `ownerName` (`ownerName:myCandleStatus`) and iCloud is signed in, tapping **Nudge** calls `sendNativeInAppNudge(...)` directly (with `"Nudge sent to <Name>!"` toast) instead of opening the Share Sheet.
   - Keep Share Sheet fallback when the friend was paired via legacy `pair.html` link or iCloud is unavailable.
   - In **Ask a Friend for Spark**, create the `SparkRequest` in CloudKit so paired friends see it automatically, and still offer **"Text Spark Link"** for friends not yet paired.
4. **[`App.tsx`](App.tsx)**
   - Poll `checkNativeIncomingNudges()` + `fetchNativeSharedPendingSparks()` on app foreground and in the 15-second poll loop.
   - Display incoming nudges as an in-app banner + `Notifications.scheduleNotificationAsync` (local alert if woken in background).

---

## 5. Known iOS / CloudKit Constraints
1. **Silent Push Delivery:** Without an external APNs push server, `CKDatabaseSubscription` only sends **silent background pushes** (`content-available: 1`), which iOS may throttle on Low Power Mode or when the app is force-closed. Keeping a **"Text via Messages"** option alongside 1-tap in-app Nudge/Spark ensures urgent rescues always get through.
2. **Migration from `v1.0` Pairings:** Friends who paired under `v1.0` (single-record `.readOnly` `CKShare`) will need to tap **+ Pair Widget** once after updating to `v1.2` to upgrade their connection to a zone-wide `.readWrite` share.

---

## 6. Testing & Rollout Checklist
1. **Unit & Regression Tests (100% coverage):**
   - Cooldown enforcement for `sendInAppNudge`
   - Incoming nudge parsing + deduplication
   - Legacy `pair.html` Share Sheet fallback when `ownerName` is missing
2. **CloudKit Console:**
   - Create `NudgeEvent` record type in Development and **Deploy Schema Changes to Production**.
3. **EAS Build & Two-Phone TestFlight Verification:**
   - Re-pair two iPhones -> verify `Nudge` delivers in-app without Share Sheet -> verify `Ask for Spark` appears automatically in paired friend's Circle -> walk 500 steps -> confirm sender's candle reignites.
