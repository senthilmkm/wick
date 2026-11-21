import { CandleSnapshot, CandleState, UserSettings, WaxLayer } from '../types/wick';

export interface KeyValueDriver {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

export interface SecureStoreDriver {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export interface WidgetBridgeDriver {
  writeAppGroupSnapshot(jsonPayload: string): void;
  reloadAllTimelines(): void;
}

export const KEY_SETTINGS = 'wick.settings.v1';
export const KEY_SNAPSHOT = 'wick.snapshot.v1';
export const KEY_WAX_LAYERS = 'wick.wax_layers.v1';
export const KEY_LAST_WIDGET_STATE = 'wick.widget.last_state';
export const KEY_LAST_WIDGET_RELOAD_AT = 'wick.widget.last_reload_at';
export const SECURE_FIRST_INSTALL_AT = 'wick_first_install_at';
export const SECURE_STARTER_DOME_CLAIMED = 'wick_starter_dome_claimed';
export const SECURE_SPARK_SECRET = 'wick_spark_secret';
export const SECURE_WEEKLY_VIDEO_QUOTA = 'wick_weekly_video_quota';

export const WIDGET_RELOAD_DEBOUNCE_MS = 15 * 60 * 1000; // 15 minutes

export const DEFAULT_SETTINGS: UserSettings = {
  dailyStepGoal: 8000,
  wakeHour: 7,
  wakeMinute: 0,
  sleepHour: 23,
  sleepMinute: 0,
  themeId: 'obsidian_night',
  micBlowOutEnabled: true,
  liveBreezeEnabled: false,
  lanternModeEnabled: false,
  sleepFocusSyncEnabled: true,
  soundEffectsEnabled: true,
  eveningNudgeEnabled: true,
};

export class LocalStorageService {
  constructor(
    private readonly kv: KeyValueDriver,
    private readonly secure: SecureStoreDriver,
    private readonly widgetBridge: WidgetBridgeDriver
  ) {}

  loadSettings(): UserSettings {
    const raw = this.kv.getString(KEY_SETTINGS);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(settings: UserSettings): void {
    this.kv.set(KEY_SETTINGS, JSON.stringify(settings));
  }

  loadSnapshot(): CandleSnapshot | null {
    const raw = this.kv.getString(KEY_SNAPSHOT);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as CandleSnapshot;
    } catch {
      return null;
    }
  }

  saveSnapshot(snapshot: CandleSnapshot, nowMs: number): boolean {
    this.kv.set(KEY_SNAPSHOT, JSON.stringify(snapshot));
    const widgetPayload = JSON.stringify({
      state: snapshot.state,
      flameIntensity: snapshot.flameIntensity,
      flameColorHex: snapshot.flameColorHex,
      stepsToday: snapshot.stepsToday,
      expectedStepsNow: snapshot.expectedStepsNow,
      streakDays: snapshot.streakDays,
      graceExpiresAt: snapshot.smokingGraceExpiresAt,
      updatedAt: snapshot.updatedAt,
    });
    this.widgetBridge.writeAppGroupSnapshot(widgetPayload);

    // Debounce WidgetKit reloads to state-bucket transitions or >= 15 min intervals
    const lastState = this.kv.getString(KEY_LAST_WIDGET_STATE) as CandleState | undefined;
    const lastReloadRaw = this.kv.getString(KEY_LAST_WIDGET_RELOAD_AT);
    const parsedLastReload = lastReloadRaw ? Number(lastReloadRaw) : 0;
    const lastReloadAt = Number.isFinite(parsedLastReload) ? parsedLastReload : 0;

    const stateChanged = lastState !== snapshot.state;
    const intervalElapsed = nowMs - lastReloadAt >= WIDGET_RELOAD_DEBOUNCE_MS;

    if (stateChanged || intervalElapsed) {
      this.kv.set(KEY_LAST_WIDGET_STATE, snapshot.state);
      this.kv.set(KEY_LAST_WIDGET_RELOAD_AT, String(nowMs));
      this.widgetBridge.reloadAllTimelines();
      return true;
    }
    return false;
  }

  loadWaxLayers(): WaxLayer[] {
    const raw = this.kv.getString(KEY_WAX_LAYERS);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as WaxLayer[]) : [];
    } catch {
      return [];
    }
  }

  appendWaxLayer(layer: WaxLayer): WaxLayer[] {
    const existing = this.loadWaxLayers();
    const deduped = existing.filter((item) => item.date !== layer.date);
    const next = [...deduped, layer];
    this.kv.set(KEY_WAX_LAYERS, JSON.stringify(next));
    return next;
  }

  async ensureFirstInstallRecorded(nowMs: number): Promise<number | null> {
    try {
      const existing = await this.secure.getItemAsync(SECURE_FIRST_INSTALL_AT);
      if (existing !== null) {
        const parsed = Number(existing);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
      await this.secure.setItemAsync(SECURE_FIRST_INSTALL_AT, String(nowMs));
      return nowMs;
    } catch {
      return null;
    }
  }

  async setFirstInstallAt(ms: number): Promise<void> {
    if (!Number.isFinite(ms) || ms <= 0) {
      return;
    }
    try {
      await this.secure.setItemAsync(SECURE_FIRST_INSTALL_AT, String(ms));
    } catch {
      // Keychain unavailable: caller must not grant a fresh trial.
    }
  }

  async isStarterDomeClaimed(): Promise<boolean> {
    const val = await this.secure.getItemAsync(SECURE_STARTER_DOME_CLAIMED);
    return val === 'true';
  }

  async markStarterDomeClaimed(): Promise<void> {
    await this.secure.setItemAsync(SECURE_STARTER_DOME_CLAIMED, 'true');
  }

  async getOrCreateSparkSecret(generator: () => string): Promise<string> {
    const existing = await this.secure.getItemAsync(SECURE_SPARK_SECRET);
    if (existing) {
      return existing;
    }
    const created = generator();
    await this.secure.setItemAsync(SECURE_SPARK_SECRET, created);
    return created;
  }

  /**
   * Persists the weekly free video export quota in iOS Keychain so
   * uninstall/reinstall cannot reset the 1/week free limit.
   */
  async loadVideoExportQuota(currentWeekKey: string): Promise<{ weekKey: string; count: number }> {
    const raw = await this.secure.getItemAsync(SECURE_WEEKLY_VIDEO_QUOTA);
    if (!raw) {
      return { weekKey: currentWeekKey, count: 0 };
    }
    try {
      const parsed = JSON.parse(raw) as { weekKey?: string; count?: number };
      if (parsed.weekKey === currentWeekKey && typeof parsed.count === 'number') {
        return { weekKey: currentWeekKey, count: Math.max(0, parsed.count) };
      }
      return { weekKey: currentWeekKey, count: 0 };
    } catch {
      return { weekKey: currentWeekKey, count: 0 };
    }
  }

  async saveVideoExportQuota(weekKey: string, count: number): Promise<void> {
    await this.secure.setItemAsync(
      SECURE_WEEKLY_VIDEO_QUOTA,
      JSON.stringify({ weekKey, count })
    );
  }
}
