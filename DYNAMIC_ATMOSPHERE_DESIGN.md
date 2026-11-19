# Dynamic Atmosphere Theme (Seasonal & Weather) — v1.1 Design Doc

## Overview
Add an optional **Auto (Seasonal / Weather)** backdrop mode in **Sanctuary** that subtly tints Wick's dark canvas (`canvasTop` / `canvasBottom` / `ambientGlow`) based on either the **current season** (zero permissions) or **local weather** (opt-in), while keeping every palette dark-first so the 3D Skia candle flame always remains the focal point.

---

## 1. User Experience & Controls (Sanctuary Tab)
- Add a **"Dynamic Atmosphere"** section or toggle in `SanctuaryScreen`:
  - **Off (Manual Theme):** Uses the user's selected static theme (`obsidian_night`, `midnight_hearth`, etc.).
  - **Seasonal (Auto):** Automatically shifts palette by calendar season (no location permission or network call required).
  - **Live Weather (Opt-In):** Fetches current WMO weather condition (Sunny, Cloudy/Fog, Rainy, Snowy, Stormy) and blends the matching dark palette.
- **Pro Gating (`trialGuard.ts`):**
  - Can be gated under `canUseTheme` / `hasProAccess(entitlement, nowMs)` as a **Wick Pro** feature (falls back to `'obsidian_night'` if trial expires without Pro).

---

## 2. Dark-First Color Palettes

### A. Seasonal Palettes (Zero Permissions)
| Season | Months (Northern) | `canvasTop` | `canvasBottom` | `ambientGlow` |
| :--- | :--- | :--- | :--- | :--- |
| **Winter** | Dec – Feb | `#090D14` | `#04060A` | `#7CC6FE` |
| **Spring** | Mar – May | `#0A110E` | `#040705` | `#7EE081` |
| **Summer** | Jun – Aug | `#140E0A` | `#070403` | `#FF9F43` |
| **Autumn** | Sep – Nov | `#140B0A` | `#070404` | `#FF6B1A` |

*(Note: Flip seasons by 6 months if southern hemisphere latitude `< 0` when location is available.)*

### B. Weather Palettes (Opt-In)
| Condition | WMO Weather Codes | `canvasTop` | `canvasBottom` | `ambientGlow` |
| :--- | :--- | :--- | :--- | :--- |
| **Clear / Sunny** | `0, 1` | `#161009` | `#070503` | `#FFB347` |
| **Partly Cloudy / Fog** | `2, 3, 45, 48` | `#0D0F13` | `#050608` | `#FF9E2C` |
| **Rain / Drizzle** | `51–67, 80–82` | `#080E17` | `#03060B` | `#64B5F6` |
| **Snow** | `71–77, 85–86` | `#0B121B` | `#05080D` | `#A5D8FF` |
| **Thunderstorm** | `95–99` | `#0B0914` | `#040308` | `#A78BFA` |

---

## 3. Architecture & Data Flow
1. **Types (`src/types/wick.ts`):**
   - Extend `UserSettings` with:
     - `atmosphereMode?: 'manual' | 'seasonal' | 'weather'` (default `'manual'`).
     - `manualWeatherCity?: { name: string; lat: number; lon: number } | null` (optional fallback if user declines GPS).
2. **Engine (`src/engine/atmosphereEngine.ts`):**
   - Pure helper `resolveDynamicTheme(baseTheme: WickTheme, mode, now: Date, weatherCondition?) -> WickTheme`.
   - Deterministic & unit-testable at 100% Jest coverage.
3. **Weather Service (`src/services/weatherService.ts`):**
   - Uses **Open-Meteo** (`https://api.open-meteo.com/v1/forecast?latitude=...&longitude=...&current=weather_code`) — free, no API key required, or **Apple WeatherKit** if enabled later.
   - Cache result in MMKV for **60 minutes** (`wick.weather_cache.v1`) so app launches remain instant and offline-safe (falls back to Seasonal palette when offline).
4. **Optional Visual Polish (`src/components/Candle3DCanvas.tsx`):**
   - Subtle low-opacity Skia particles behind the candle during Rain/Snow (disabled when `GLASS_DOME` is active or in Reduce Motion mode).

---

## 4. App Store & Privacy Checklist (Required Only for Live Weather)
- **Seasonal mode** requires **no** new permissions or App Store Connect changes.
- **Live Weather with GPS** requires:
  1. `NSLocationWhenInUseUsageDescription` in `app.config.ts` (`"Wick uses your approximate location to match your candle backdrop to today's local weather."`).
  2. Coarse location (`expo-location` with `Accuracy.Low`) — never request Always location or precise tracking.
  3. Update App Store Connect **App Privacy** nutrition label to declare **Coarse Location** (App Functionality, not linked to user, not used for tracking).
- *(Alternative with zero location permission: let the user type/select a city name via Open-Meteo Geocoding API.)*
