export type CandleState =
  | 'UNLIT_MORNING'
  | 'IGNITING'
  | 'BLAZING'
  | 'STEADY'
  | 'FLICKERING'
  | 'DYING_EMBER'
  | 'SMOKING_GRACE'
  | 'NIGHT_SLEEP'
  | 'GLASS_DOME'
  | 'EXTINGUISHED';

export type ThemeId =
  | 'obsidian_night'
  | 'midnight_hearth'
  | 'velvet_espresso'
  | 'deep_forest'
  | 'lunar_slate'
  | 'plum_dusk';

export interface WickTheme {
  id: ThemeId;
  name: string;
  isPro: boolean;
  canvasTop: string;
  canvasBottom: string;
  ambientGlow: string;
  primaryText: string;
  accent: string;
}

export interface UserSettings {
  dailyStepGoal: number;
  wakeHour: number; // 0-23, e.g. 7
  wakeMinute: number; // 0-59
  sleepHour: number; // 0-23, e.g. 23
  sleepMinute: number; // 0-59
  themeId: ThemeId;
  micBlowOutEnabled: boolean;
  liveBreezeEnabled: boolean;
  sleepFocusSyncEnabled: boolean;
  soundEffectsEnabled: boolean;
}

export interface WaxLayer {
  id: string;
  date: string; // YYYY-MM-DD local
  colorHex: string;
  thicknessMm: number;
  stepsAchieved: number;
  stepGoal: number;
  peakIntensity: number;
}

export interface CandleSnapshot {
  dateKey: string; // YYYY-MM-DD in user's local timezone
  state: CandleState;
  stepsToday: number;
  expectedStepsNow: number;
  paceRatio: number; // 0..2+
  flameIntensity: number; // 0..1
  flameColorHex: string;
  meltProgress: number; // 0 (full height) .. 1 (melted down)
  streakDays: number;
  waxGrams: number;
  glassDomesOwned: number;
  glassDomeActiveUntil: number | null; // epoch ms
  smokingGraceExpiresAt: number | null; // epoch ms
  smokingStartSteps: number | null;
  ignitedAt: number | null; // epoch ms
  updatedAt: number; // epoch ms
}

export interface FriendCandle {
  id: string;
  displayName: string;
  state: CandleState;
  flameIntensity: number;
  streakDays: number;
  updatedAt: number;
}

export interface SparkRequestToken {
  sparkId: string;
  senderName: string;
  senderDeviceId: string;
  createdAt: number;
  expiresAt: number;
  stepsRequired: number;
  signature: string;
}

export interface ActiveSparkRescue {
  sparkId: string;
  senderName: string;
  stepsWalked: number;
  stepsRequired: number;
  expiresAt: number;
  completed: boolean;
}

export interface EntitlementState {
  isPro: boolean;
  isEligibleForIntroTrial: boolean;
  starterDomeClaimed: boolean;
  firstInstallAt: number;
  freeVideoExportsThisWeek: number;
  weekKey: string;
}
