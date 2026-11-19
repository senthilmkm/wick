# CloudKit Remote Spark Rescue (Option B) — v1.1 Design Doc

## Goal
Upgrade Spark Rescue from local/shared-key link validation (Option A) to **true cross-device remote reignition**, so when Friend B walks 500 steps on their iPhone, **Friend A's candle automatically reignites** via iCloud CloudKit.

*(Requires a native `eas build` and CloudKit Production Schema deployment — cannot be shipped via `eas update` alone.)*

---

## 1. CloudKit Schema (`iCloud.com.senthilmkm.wick`)
Add a new record type **`SparkRequest`** in zone `WickCircleZone` (and deploy to **Production** in Apple CloudKit Console):

| Field | Type | Purpose |
| :--- | :--- | :--- |
| `sparkId` | `String` (Queryable) | Unique ID matching the Spark URL |
| `senderName` | `String` | Sender's candle/display name |
| `status` | `String` | `'pending'` \| `'completed'` \| `'expired'` |
| `stepsWalked` | `Int64` | Progress updated by rescuer |
| `stepsRequired` | `Int64` | Default `500` |
| `expiresAt` | `Double` | Epoch ms (`+24h`) |
| `rescuedBy` | `String` | Optional rescuer label |
| `completedAt` | `Double` | Epoch ms when 500 steps finished |

---

## 2. Native Swift Changes (`modules/wick-native/ios/WickNativeModule.swift`)
1. **`createSparkShareRecord(sparkId, senderName, stepsRequired, expiresAt)`:**
   - Saves a `SparkRequest` record in `privateCloudDatabase` (`WickCircleZone`).
   - Attaches a `CKShare` with **`publicPermission = .readWrite`** (so the invited friend can write `status = "completed"` back).
   - Returns the `icloud.com/share/...` URL.
2. **`completeSparkShareRecord(sparkId, stepsWalked)`:**
   - Called on Friend B's iPhone when `activeRescue.completed` becomes `true`.
   - Fetches the shared `SparkRequest` from `sharedCloudDatabase`, sets `status = "completed"`, `stepsWalked`, and `completedAt`, and saves it back.
3. **`checkPendingSparkRescues()`:**
   - Called on Friend A's iPhone on foreground/AppState active and via `CKDatabaseSubscription` silent push.
   - If the sender's `SparkRequest` record has `status == "completed"`, triggers `reigniteFromSpark(snapshot, Date.now())` and archives/deletes the `SparkRequest` so it cannot be replayed.

---

## 3. Security & Anti-Replay
- Validate `expiresAt > Date.now()` before accepting or completing.
- Clear/delete the `SparkRequest` record once Friend A's candle reignites so one Spark cannot reignite multiple times.
- Keep **Option A (`SPARK_SHARED_APP_SECRET`)** as an offline fallback when iCloud is not signed in.
