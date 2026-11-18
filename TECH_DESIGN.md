# Wick — iOS Technical Design Document (React Native)

> **Version:** 1.0  
> **Platform:** iOS 17.0+ (React Native + Expo Prebuild / Custom Swift Native Extensions)  
> **Architecture:** Local-First, Privacy-Preserving, Zero-Account Onboarding  
> **Tagline:** *Keep your wick lit.*

---

## 1. Executive Summary & Core Philosophy

**Wick** is a minimalist, ambient iOS fitness app that replaces overwhelming step charts, rings, and clinical dashboards with a single, hyper-realistic **3D glowing candle**.

* **Morning Ignition:** When your Sleep Schedule ends, the wick sits dark and ready. Your very first steps of the day strike the match and light the flame.
* **Daytime Pacing:** Throughout the day, the candle burns and responds to your movement in real time against an expected hourly pacing curve. Stay on pace and the flame blazes warm white-gold; fall behind and it shrinks, flickers, and dims to a crimson ember.
* **Nighttime Freeze:** At bedtime, iOS Sleep Focus—or physically blowing into your phone's microphone—freezes the decay, turns the flame into a soft lunar-blue nightlight (or extinguishes it with a wisp of 3D smoke), and hardens the day's melted wax into a permanent colored layer on your candle.

---

## 2. World's Best Viral UX & Retention Loops

Wick is engineered around **emotional accountability**, **the Tamagotchi Effect**, and **Loss Aversion** rather than raw numbers.

| Viral Loop | Mechanic | Why It Spreads |
| :--- | :--- | :--- |
| **1. Multiplayer Lock Screen Widgets** | Put a partner's or best friend's live candle on your iOS Lock Screen. When their wick dims to a dying ember, you see it every time you check your phone and text them to walk. | Requires both users to install Wick; creates daily organic word-of-mouth. |
| **2. "Spark" Rescue (500-Step Save)** | When your candle is in the 60-minute smoking grace period, tap **Send Spark** to text a friend a Universal Link. If they walk **500 steps** for you, your candle reignites in a burst of golden sparks. | Turns a solo fitness failure into a collaborative, invite-driven rescue game. |
| **3. Aesthetic 3-Second Video Exports** | Tapping **Share** exports a 3-second looping `.mp4` (9:16 Stories/TikTok format) of your actual 3D candle—either roaring or sputtering—over your chosen moody background with the date and a subtle `wick` watermark. | People don't share step counts; they share aesthetic stories of struggle or streaks. |
| **4. "Day 100" Wax Drip Streaks** | Each completed day cools into a permanent, colored wax band at the base of your candle. If the flame dies and isn't rescued, the candle resets to a plain, fresh cylinder. | Visual proof of consistency that users proudly screenshot at Day 10, Day 30, and Day 100. |
| **5. Tactile "Blow Out" Ritual** | At night, blowing into the bottom iPhone microphone physically extinguishes the 3D flame and sends a volumetric smoke trail up the screen. | Novel hardware-linked interaction tailor-made for short-form TikTok/Reels demos. |

---

## 3. World's Best UX Styles & Design System

* **Zero-Dashboard Immersion:** 90% of the Home screen is the 3D candle canvas. No bar charts, no cluttered cards, no aggressive red notification badges.
* **Ultra-Low Friction:**
  * **No Sign-Up Wall:** Zero email, password, or account creation. Opens straight into a 3-step, 30-second onboarding (1. Pick Candle Vibe, 2. Daily Step Goal Slider, 3. Grant HealthKit + Motion + Notifications).
  * **Zero-Tap Daily Loop:** Once set up, Wick runs automatically in the background via HealthKit, CoreMotion, and Lock Screen widgets.
* **Typography:**
  * Display / Headers: `SF Pro Rounded` (Semibold/Medium) for warmth and approachability.
  * Minimal Metrics (when toggled): `SF Mono` with `tabular-nums` so numbers never jitter.
* **Haptic Choreography (`CoreHaptics` + `expo-haptics`):**
  * *Match Strike (First Step):* Crisp transient tap followed by a rising warm rumble.
  * *Step Tick (Foreground):* Subtle micro-pulse every 50 steps while watching the flame grow.
  * *Blow-Out:* Soft decaying vibration synced with the smoke animation.
  * *Spark Rescue:* Triple celebratory chime haptic.
* **Accessibility & Apple HIG:** Full Dynamic Type support on all text overlays, VoiceOver status announcements (e.g., *"Your wick is blazing at 84% pace, 6,400 steps today"*), and Reduce Motion fallback (smooth opacity/color transitions instead of rapid flicker).

---

## 4. App Navigation & Tab Architecture

To preserve the **single-page candle experience** while supporting streaks, friends, and themes, Wick uses a **4-tab floating translucent glass pill bar** (`UIBlurEffect` / `expo-blur`) that **auto-fades out** after 4 seconds of inactivity on the Home tab:

1. **Flame (Home)**
   * Full-screen 3D interactive candle + dynamic radial ambient lighting.
   * Tap candle to briefly reveal today's step count & pace status pill; long-press for **Glass Dome** or **Blow Out** quick actions.
   * Floating corner icon buttons: **Share Video/PDF** (top-right) and **Send Spark** (appears when flickering/smoking).
2. **Wax Ledger (History & Streaks)**
   * Interactive 3D/2D scrollable view of your candle's hardened wax layers (each band = 1 day, colored by how brightly you burned).
   * Monthly burn calendar + **Export Monthly Burn Report (PDF)** button.
3. **Circle (Friends & Spark)**
   * Paired friends' live candle statuses (blazing, flickering, smoking).
   * **Send Spark** / **Accept Spark (Walk 500 Steps)** live tracker.
   * Quick-setup guide to pin a friend's candle to your iOS Lock Screen Widget.
4. **Sanctuary (Themes & Settings)**
   * **Background Theme Picker** (live preview behind the candle).
   * Daily Step Goal, Wake/Sleep Schedule sync, Mic Blow-Out toggle, Glass Dome inventory (bought with earned wax), HealthKit permissions, and Privacy/Support links.

---

## 5. Home Background Themes (Colors & Shades)

Every theme is engineered with dark, low-luminance surfaces so the 3D candle's emissive flame and point light remain the focal point with high contrast:

| Theme Name | Canvas Primary (Top) | Canvas Vignette (Bottom) | Ambient Glow Tint | Primary Text / Accent |
| :--- | :--- | :--- | :--- | :--- |
| **Obsidian Night** *(Default)* | `#0A0A0C` | `#040405` | `#FF8C24` (Warm Amber) | `#F5F5F7` / `#FF9F43` |
| **Midnight Hearth** | `#140E0C` | `#080504` | `#FF6B1A` (Deep Ember) | `#FAF3EE` / `#FF7A33` |
| **Velvet Espresso** | `#16110F` | `#0B0807` | `#FFB347` (Honey Gold) | `#F2E9E4` / `#E09F3E` |
| **Deep Forest** | `#0A120E` | `#040806` | `#FFA94D` (Campfire) | `#E8F1EC` / `#74C69D` |
| **Lunar Slate** | `#0D131D` | `#06090E` | `#90E0EF` (Cool Silver-Blue) | `#EDF2F4` / `#7CC6FE` |
| **Plum Dusk** | `#130C18` | `#08050B` | `#FF9E64` (Peach Flame) | `#F4ECF7` / `#C77DFF` |

---

## 6. Tech Stack & Native Libraries (iOS / React Native)

> **Build Workflow:** Expo SDK (Prebuild / Continuous Native Generation) with custom Swift native modules (`expo-modules-api`) and `@bacons/apple-targets` for WidgetKit extensions.

| Capability | Recommended Library / Native API | Purpose |
| :--- | :--- | :--- |
| **3D Candle Rendering** | `react-native-filament` (Metal-backed PBR) | Renders realistic 3D wax cylinder, subsurface scattering, melting height, dynamic wax drip layers, and real-time point light casting onto the background. *(Fallback: `expo-gl` + `three`)* |
| **2D Shaders, Glow & Smoke** | `@shopify/react-native-skia` | Volumetric radial flame halo, rising 3D-like smoke particles on blow-out, and offscreen frame compositing. |
| **Animations & Gestures** | `react-native-reanimated` + `react-native-gesture-handler` | 120fps ProMotion UI transitions, floating tab auto-hide, long-press Glass Dome drop. |
| **HealthKit & CoreMotion** | Custom Swift Native Module (`HKObserverQuery` + `CMPedometer`) + `@kingstinct/react-native-healthkit` | Background step delivery via `HKObserverQuery` + instant foreground step bursts via `CMPedometer`. |
| **Local Structured DB** | `expo-sqlite` | Stores daily burn logs, hardened wax layer colors, hourly step snapshots, and streak history locally. |
| **Fast Local KV & Widget Sync** | `react-native-mmkv` + App Group `UserDefaults` | Sub-millisecond read/write for live candle state shared with the Swift WidgetKit extension via `group.com.wick.app`. |
| **Secure Storage** | `expo-secure-store` | Stores device cryptographic keypair (Ed25519/HMAC) for signing Spark Rescue requests and friend pairing tokens. |
| **Notifications** | `expo-notifications` (`UNUserNotificationCenter`) | Morning Sleep Schedule wake trigger, low-ember warning, 60-minute smoking grace countdown. |
| **Microphone Blow-Out** | `expo-av` / `react-native-audio-api` | Low-latency mic metering (`averagePowerForChannel`) + low-frequency wind-burst detection to extinguish the flame. |
| **Apple Native Share Sheet** | `react-native-share` / `UIActivityViewController` | Native iOS Share Sheet for 3-second `.mp4` videos, Spark Universal Links, and PDF reports. |
| **3-Second Video Export** | Custom Swift `AVAssetWriter` + `Skia` / `Metal` frame capture | Renders a 90-frame (30fps, 3s) 1080×1920 `.mp4` loop of the live candle with date & watermark. |
| **PDF Export** | `expo-print` (HTML-to-PDF) / `UIGraphicsPDFRenderer` | Generates an aesthetic **"Wax Ledger"** monthly burn report PDF shareable via Apple Share Sheet. |
| **Lock Screen Widgets** | SwiftUI `WidgetKit` + `ActivityKit` (via `@bacons/apple-targets`) | Lock Screen (`accessoryCircular`, `accessoryRectangular`, `accessoryInline`) & Home Screen widgets + Live Activity for 60-min Resuscitation / Spark Rescue. |
| **Haptics** | `expo-haptics` + Custom Swift `CoreHaptics` | Rich tactile feedback for match strike, step ticks, blow-out, and Spark Rescue. |
| **Build Auto-Increment** | `app.config.ts` + EAS Build (`autoIncrement: true`) / Fastlane `agvtool` | Automatically increments `CFBundleVersion` (`buildNumber`) on every TestFlight / App Store build. |

---

## 7. Local-First Data Architecture

All personal health, step, streak, and theme data is stored **100% locally on the user's iPhone**. There is no central user database holding personal fitness history.

1. **`expo-sqlite` (`wick.db`):**
   * `daily_burns`: `(date TEXT PRIMARY KEY, step_goal INT, steps_achieved INT, peak_brightness REAL, wax_color_hex TEXT, status TEXT, dome_used BOOLEAN)`
   * `wax_layers`: `(id INTEGER PRIMARY KEY, streak_id INT, day_index INT, color_hex TEXT, thickness_mm REAL, created_at TEXT)`
   * `friends`: `(id TEXT PRIMARY KEY, display_name TEXT, public_key TEXT, last_candle_state TEXT, last_updated TEXT)`
2. **`react-native-mmkv` + App Group `UserDefaults` (`group.com.wick.app`):**
   * Stores the lightweight JSON snapshot read by WidgetKit:
     ```json
     {
       "state": "BLAZING",
       "flameIntensity": 0.88,
       "flameColorHex": "#FF9E2C",
       "stepsToday": 6420,
       "expectedStepsNow": 5800,
       "streakDays": 14,
       "graceExpiresAt": null,
       "updatedAt": "2026-11-18T14:30:00Z"
     }
     ```
3. **`expo-secure-store`:**
   * `wick_device_id`: Local UUIDv4.
   * `wick_signing_private_key`: Used to sign Spark Rescue payloads so friends can't spoof rescues.

---

## 8. Killer UX: Realistic 3D Candle & Full-Day Lifecycle

The candle is a living, dynamic 3D object powered by `react-native-filament` (PBR wax material with subsurface scattering) + `Skia` (volumetric glow & smoke).

### Candle State Machine

| State | Trigger | 3D Flame Size & Color | Wax & Glow Behavior |
| :--- | :--- | :--- | :--- |
| `UNLIT_MORNING` | Sleep Schedule ends | No flame; dark charred wick | Cold wax cylinder; subtle moonlight rim. |
| `IGNITING` | First $\ge 5$ steps via `CMPedometer` | Spark burst $\rightarrow$ rises to full flame | Warm golden flash expands across the dark canvas. |
| `BLAZING` | Actual steps $\ge 100\%$ of hourly curve | Tall, steady, bright white-gold (`#FFF6D6` $\rightarrow$ `#FF9E2C`) | Wide radial ambient glow; gentle molten wax pool at top. |
| `STEADY` | $80\% \le$ pace $< 100\%$ | Medium amber-orange (`#FF8C24`) | Calm, cozy flicker; steady glow radius. |
| `FLICKERING` | $50\% \le$ pace $< 80\%$ | Smaller, anxious swaying flame (`#E85D04`) | Glow radius contracts; subtle wind-like flicker. |
| `DYING_EMBER` | Pace $< 50\%$ | Tiny, sputtering crimson-orange tip (`#9D0208`) | Minimal glow; urgent visual signal to walk. |
| `SMOKING_GRACE` | Deficit hits $0\%$ threshold | Flame out; glowing red wick tip + rising grey `Skia` smoke | **60-minute Resuscitation Window** begins. |
| `NIGHT_SLEEP` | Sleep Focus OR Mic Blow-Out | Soft pulsing lunar-blue (`#7CC6FE`) or extinguished with smoke | Decay frozen; molten wax cools into a new hardened streak band. |
| `GLASS_DOME` | User drops Glass Dome (costs earned wax) | Frozen at current state inside a translucent 3D glass bell jar | 24-hour guilt-free pause (sick/travel day); streak preserved. |

### Full-Day Burn & Melt Progression
* **7:00 AM:** `UNLIT_MORNING` $\rightarrow$ user takes first steps to bathroom $\rightarrow$ `IGNITING` $\rightarrow$ `BLAZING`.
* **7:00 AM – 11:00 PM:** The candle cylinder **gradually melts downward** (interpolating from `100%` daily burn height to `0%` at bedtime), while its base retains the stacked, multi-colored hardened wax rings from previous days (`Day 1` to `Day N`).
* **Instant Reward, Gradual Decay:** Sitting still causes a slow, fair decline over hours; taking a brisk walk immediately surges the flame height and color temperature back toward white-gold.

---

## 9. Apple HealthKit + CoreMotion Bridge & Pacing Algorithm

### Native Bridge (`WickMotionModule.swift`)
1. **Background (`HKObserverQuery`):**
   * Registers `HKObserverQuery` on `HKQuantityType.quantityType(forIdentifier: .stepCount)` with `enableBackgroundDelivery(for:frequency: .immediate)`.
   * On wake, runs `HKStatisticsQuery` for today's cumulative steps, recalculates `CandleState`, writes to App Group `UserDefaults`, calls `WidgetCenter.shared.reloadAllTimelines()`, and schedules/cancels local notifications.
2. **Foreground (`CMPedometer`):**
   * Calls `pedometer.startUpdates(from: startOfDay)` so every live step while looking at the app animates the 3D flame in real time with zero HealthKit query delay.

### Hourly Progression Curve (Anti-Frontloading Algorithm)
If a user walks 10,000 steps at 7:00 AM, they shouldn't be completely sedentary until midnight without the candle reacting—nor should they be unfairly punished at 8:00 AM.

$$\text{ExpectedSteps}(t) = \text{DailyGoal} \times \left( 0.85 \cdot \text{SmoothStep}(t_{\text{norm}}) + 0.15 \cdot t_{\text{norm}} \right)$$

Where $t_{\text{norm}} = \text{clamp}\left(\frac{t - t_{\text{wake}}}{t_{\text{sleep}} - t_{\text{wake}}}, 0, 1\right)$.
* **Morning Run Bonus:** Front-loading steps builds a **surplus buffer** that keeps the flame `BLAZING` for hours, but a gentle hourly baseline (`activity_decay`) still encourages a short afternoon coffee/stretch walk to keep the flame at peak brightness.

### Forgiveness Mechanics
* **60-Minute Smoking Grace Period:** When the flame goes out, the user gets a push notification (*"Your wick is still smoking—walk briskly for 5 minutes to rekindle it"*). Walking $\ge 350$ steps within 60 minutes blows oxygen onto the embers and reignites the flame.
* **Glass Dome:** Earned by completing consecutive days (100g wax per day; 1 Glass Dome = 300g wax). Dropping it freezes all decay for 24 hours.

---

## 10. Tech Design: "Send a Spark Request" (500-Step Friend Rescue)

Because all personal fitness data is stored **locally**, Spark Rescue uses a **stateless, ephemeral relay** (e.g., Apple **CloudKit Public Database** with TTL or a minimal serverless APNs relay) that stores *zero* step history—only a signed rescue token.

### Sequence Flow
1. **Request Creation (Sender):**
   * Sender's candle enters `DYING_EMBER` or `SMOKING_GRACE`.
   * Sender taps **Send Spark** $\rightarrow$ app creates a `SparkToken`:
     `{ sparkId: UUID, senderName, senderPushTokenHash, expiresAt: now + 60m, signature }`
   * Opens Apple Share Sheet (`UIActivityViewController`) with a Universal Link: `https://wick.app/spark/<sparkId>`.
2. **Rescue Execution (Friend):**
   * Friend taps the link $\rightarrow$ opens Wick (or App Store / App Clip if not installed).
   * Friend taps **Walk 500 Steps to Rescue** $\rightarrow$ starts a dedicated `CMPedometer.startUpdates(from: Date())` session + **Live Activity** on their Lock Screen showing `240 / 500 steps`.
3. **Completion & Reignition:**
   * Once `CMPedometer` reports `steps >= 500`, the friend's app signs a completion receipt and posts it to the ephemeral relay, which fires a **silent + visible APNs push** to the Sender.
   * Sender's device receives the push $\rightarrow$ updates local `MMKV` / `SQLite` $\rightarrow$ transitions candle to `BLAZING` with a golden spark burst animation + `WidgetCenter.shared.reloadAllTimelines()`.

---

## 11. Lock Screen Widgets (`WidgetKit`)

Implemented in SwiftUI as a separate iOS target (`WickWidgets`) inside the Xcode workspace, reading from `group.com.wick.app`:

* **`accessoryCircular` (Lock Screen):** Minimalist glowing flame glyph + curved arc showing daily pace %.
* **`accessoryRectangular` (Lock Screen):** Displays either **Your Candle** or **Friend's Candle** (*"Maya's Wick • Flickering • 42% pace"*), with a mini flame icon that visually dims/smokes based on state.
* **`accessoryInline` (Lock Screen):** *"🕯️ Wick: Blazing (14d streak)"*.
* **`systemSmall` / `systemMedium` (Home Screen):** Rich dark-gradient widget showing the rendered candle state, streak wax count, and quick-open deep link (`wick://home` or `wick://spark/<id>`).

---

## 12. Web Assets (`/docs` Folder)

When implementation begins, all static web pages required for App Store Connect, Universal Links, and organic marketing will live in `/docs` (ready for GitHub Pages or Cloudflare Pages):

```text
/docs
├── index.html          # Stunning dark-mode marketing landing page (3D candle preview, App Store badge, viral features)
├── support.html        # FAQ, HealthKit troubleshooting, Glass Dome & Spark Rescue guide, contact link
├── privacy.html        # Local-first privacy policy (explicitly states zero server-side health/step storage)
├── terms.html          # Terms & Conditions, subscription/trial terms, non-medical fitness disclaimer
└── .well-known/
    └── apple-app-site-association   # Enables Universal Links for https://wick.app/spark/*
```

---

## 13. Apple Best Practices & App Store Compliance

* **HealthKit Review Guidelines (5.1.1 & 5.1.3):**
  * Clear `NSHealthShareUsageDescription`: *"Wick reads your daily step count and sleep schedule to animate your candle's brightness and freeze decay while you sleep. Your health data never leaves your device."*
  * Never use HealthKit data for advertising, analytics, or third-party sharing.
  * Include a clear non-medical disclaimer in onboarding and `terms.html`.
* **Required `Info.plist` Keys:**
  * `NSHealthShareUsageDescription`
  * `NSMotionUsageDescription` (*"Wick uses step motion to light your candle on your first step and animate the flame in real time."*)
  * `NSMicrophoneUsageDescription` (*"Wick listens for a gentle blow into the microphone when you choose to blow out your candle at bedtime."*)
* **Privacy Manifest (`PrivacyInfo.xcprivacy`):** Declare `UserDefaults` (App Group) and `NSPrivacyAccessedAPITypes` accurately for App Store Connect submission.
* **Battery & Performance:** Cap background `HKObserverQuery` work to `< 200ms` (pure math + `UserDefaults` write + `reloadAllTimelines()`); pause 3D Metal render loop immediately on `AppState` background transition.

---

## 14. Multiplayer Lock Screen Widget Sync (CloudKit Shared DB)

**Yes — Apple CloudKit Shared Database (`CKDatabase.Scope.shared`) + `CKShare` is the primary sync mechanism** for Multiplayer Lock Screen Widgets because it requires **zero custom backend** and **zero user accounts** (leveraging the user's existing iCloud session).

### Architecture & Privacy Boundary
* **Private-to-Shared Zone:** Each user's app creates a `WickCircleZone` in their **CloudKit Private Database** containing a single lightweight `FriendCandleStatus` `CKRecord`:
  ```json
  {
    "displayName": "Maya",
    "state": "FLICKERING",
    "flameIntensity": 0.42,
    "streakDays": 14,
    "updatedAt": "2026-11-18T16:10:00Z"
  }
  ```
  *(Raw step counts and HealthKit data are **never** written to CloudKit.)*
* **Pairing via `CKShare`:** Tapping **Invite Friend to Widget** generates a `CKShare` URL (shared via iMessage / Apple Share Sheet). When the friend accepts, the record appears in their **CloudKit Shared Database**.
* **Silent Push Updates (`CKDatabaseSubscription`):**
  1. Both devices register a `CKDatabaseSubscription` on their Shared Database (`shouldSendContentAvailable = true`).
  2. When Maya's candle changes state bucket (e.g., `BLAZING` $\rightarrow$ `FLICKERING`), Maya's app updates her `FriendCandleStatus` `CKRecord`.
  3. CloudKit fires a **silent APNs push** to paired friends $\rightarrow$ wakes Wick in the background $\rightarrow$ writes the friend's updated status to App Group `UserDefaults` (`group.com.wick.app`) $\rightarrow$ calls `WidgetCenter.shared.reloadAllTimelines()`.
* **WidgetKit Reload Budget:** iOS limits widget timeline reloads to ~40–70/day. Updates are **debounced to state-bucket transitions** (and at most once every 15 minutes) rather than firing on every step.
* **iCloud Fallback:** If a user is signed out of iCloud, Solo mode continues 100% locally; the *Circle* tab displays a clean prompt to sign into iCloud to enable friend widgets.

---

## 15. Monetization, Free Tier & Anti-Abuse Architecture

* **SDK:** `react-native-purchases` (RevenueCat) backed by Apple **StoreKit 2** (or native StoreKit 2 Swift module).
* **App Store Requirement:** Include a visible **Restore Purchases** button and subscription management link (`itms-apps://apps.apple.com/account/subscriptions`) inside the *Sanctuary* tab.

### Free Tier vs. Direct 7-Day Free Trial (Viral-Safe Strategy)
Because Wick's #1 growth loop is **friend invites** (Multiplayer Lock Screen Widgets & Spark Rescue), a pure Hard Paywall on launch would cause invited friends to bounce before pairing. Therefore, Wick uses a **Generous Solo Free Tier + 7-Day Pro Trial**:
* **Free Forever Tier (with clear limits):**
  * Solo 3D candle (*Obsidian Night* theme only).
  * Basic Lock Screen widget (own candle only).
  * **1** paired friend in *Circle* (keeps viral Spark Rescue & partner accountability working).
  * **7-day** rolling Wax Ledger history.
  * **1** starter Glass Dome (lifetime free).
  * Watermarked 3-second `.mp4` Story export (1/week).
* **Wick Pro (7-Day Free Trial $\rightarrow$ \$14.99/year or \$2.99/month):**
  * All 6+ background themes & custom 3D candle shapes/wax textures.
  * **Unlimited** Multiplayer Lock Screen Widgets & Circle friends.
  * **Unlimited** watermark-free 3-second `.mp4` Video Exports & **PDF Monthly Burn Reports**.
  * Full **Wax Ledger** history (Day 1 $\rightarrow$ Day 100+).
  * **1 bonus Glass Dome / month**.
* **Paywall Timing:** Present the **7-Day Free Trial** offer right after the user's emotional "aha" moment—when they take their first steps and watch the 3D candle ignite for the first time (with a subtle "Continue with Free Tier" dismiss option).

### Preventing Uninstall / Reinstall Free-Trial Abuse
1. **StoreKit 2 Apple ID Enforcement (Primary):**
   * The 7-day trial is configured as an **App Store Introductory Offer**. Apple tracks intro-offer eligibility **per Apple ID** (`Product.SubscriptionInfo.isEligibleForIntroOffer`), not per app install.
   * If a user uninstalls, reinstalls, and taps "Start 7-Day Free Trial," StoreKit 2 automatically detects `isEligibleForIntroOffer == false` and hides the free trial UI—charging immediately if they subscribe.
2. **iOS Keychain Persistence (Secondary — Local Grace / Onboarding State):**
   * Never store trial or starter-gift flags (e.g., `starter_dome_claimed`, `first_install_at`) in `UserDefaults` or `SQLite`, which are wiped on uninstall.
   * Store them in the **iOS Keychain** (`expo-secure-store` with `kSecAttrAccessibleAfterFirstUnlock`), which **persists across app uninstalls and reinstalls** on the device.
3. **CloudKit Private DB Flag (Optional Cross-Device Sync):**
   * Mirror `hasClaimedStarterTrial` in the user's private CloudKit zone so even a device wipe or new iPhone under the same iCloud account cannot re-claim one-time starter perks.

---

## 16. Step Tracking Source of Truth & Edge Cases

* **Apple Watch + iPhone Deduplication:**
  * `CMPedometer` only reads the iPhone's M-series motion coprocessor and misses Apple Watch steps.
  * **Rule:** **HealthKit (`HKStatisticsQuery`) is the single source of truth** for total daily steps (it automatically merges and deduplicates iPhone + Apple Watch). `CMPedometer` is used *exclusively* for instantaneous foreground animation deltas while the app is open.
* **Midnight Rollover & Timezones:**
  * If a user is awake past 12:00 AM without triggering Sleep Mode, the current day's candle freezes and hardens at `00:00` local time (or user's configured cutoff, e.g., `02:00 AM` for night owls) before resetting to `UNLIT_MORNING`.
  * Traveling across timezones recalculates `t_norm` against `TimeZone.current` so the hourly curve shifts smoothly without false deficits.
* **Force-Quit Behavior:** If a user force-quits Wick from the iOS App Switcher, iOS suspends background `HKObserverQuery` wakeups until the app is reopened. On next launch, Wick immediately backfills the missed hours from HealthKit.

---

## 17. Audio Session & Mic Blow-Out Safety (`AVAudioSession`)

* **Preventing Music Interruption:** Configuring `AVAudioSession` in `.playAndRecord` globally will pause or duck the user's Spotify, Apple Music, or podcasts.
* **Solution:**
  * Keep default audio category as `.ambient` with `.mixWithOthers` (optional subtle fire crackle / match-strike SFX will respect the iPhone Mute switch and never pause music).
  * Activate `.playAndRecord` (with `.defaultToSpeaker` and `.allowBluetooth`) **only** during the active **"Blow Out"** bedtime modal, and immediately deactivate (`setActive(false, options: .notifyOthersOnDeactivation)`) once the flame extinguishes.

---

## 18. Spark Rescue iOS App Clip (`WickSparkClip`)

* **Reducing Non-User Friction:** If a user sends a Spark Request (`https://wick.app/spark/<sparkId>`) to a friend who does **not** have Wick installed, forcing a full App Store download + onboarding hurts conversion.
* **Solution:** Add a lightweight **iOS App Clip** target (`< 15 MB`) in Xcode that launches directly from the iMessage link:
  1. Displays the friend's dying candle + **"Walk 500 steps to save [Name]'s wick"**.
  2. Requests only `NSMotionUsageDescription` (`CMPedometer`)—no HealthKit setup needed.
  3. Fires the rescue completion ping at 500 steps, then presents `SKOverlay` to install the full Wick app in one tap.

---

## 19. Simulator Testing & Privacy-Safe Diagnostics

* **iOS Simulator Limitation:** The Xcode Simulator cannot generate real `CMPedometer` or live HealthKit step streams.
* **Solution (`__DEV__` Candle Debugger):** Build a hidden developer drawer (triple-tap version number in *Sanctuary*) in debug builds to:
  * Inject simulated step bursts (`+50`, `+500`, `+2,000` steps).
  * Scrub time-of-day (`07:00` $\rightarrow$ `16:00` $\rightarrow$ `23:00`) to test the hourly curve and melting.
  * Force transitions into `SMOKING_GRACE`, `NIGHT_SLEEP`, `GLASS_DOME`, and `SPARK_RESCUE`.
* **Privacy-First Telemetry & Crash Reporting:**
  * **TelemetryDeck** (zero PII, no IDFA, hashed anonymous signals) to measure onboarding drop-off, trial conversion, and Spark Rescue completion rates.
  * **Sentry** (`react-native-sentry`) with PII scrubbing enabled so crash logs never capture names or health metrics.
