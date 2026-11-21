import { ImageFormat, matchFont, Skia } from '@shopify/react-native-skia';
import { Share } from 'react-native';
import RNShare from 'react-native-share';
import { CANDLE_MOOD_COLORS, WeeklyRecapSummary } from '../engine/candleMath';
import { CandleMood, CandleState, WickTheme } from '../types/wick';

export interface DailyShareCardInput {
  candleName?: string;
  streakDays: number;
  stepsToday: number;
  dailyStepGoal: number;
  state: CandleState;
  flameIntensity: number;
  flameColorHex: string;
  waxGrams: number;
  theme: WickTheme;
}

export interface WeeklyShareCardInput {
  candleName?: string;
  recap: WeeklyRecapSummary;
  theme: WickTheme;
}

export interface ShareCardDriver {
  renderDailyPngDataUri(input: DailyShareCardInput): string | null;
  renderWeeklyPngDataUri(input: WeeklyShareCardInput): string | null;
  openImageShare(options: {
    title: string;
    message: string;
    dataUri: string;
    filename: string;
  }): Promise<'shared' | 'dismissed'>;
  openTextShare(title: string, message: string): Promise<'shared' | 'dismissed'>;
}

export function formatDailyShareMessage(input: DailyShareCardInput): string {
  const name = input.candleName?.trim();
  const prefix = name ? `${name} • ` : '';
  const stateLabel = input.state.toLowerCase().replace(/_/g, ' ');
  return `${prefix}Day ${input.streakDays} • My wick is ${stateLabel} (${input.stepsToday.toLocaleString(
    'en-US'
  )} / ${input.dailyStepGoal.toLocaleString('en-US')} steps today) — Keep your wick lit!`;
}

export function formatWeeklyShareMessage(input: WeeklyShareCardInput): string {
  const titlePrefix = input.candleName?.trim() ? input.candleName.trim().toUpperCase() : 'WICK';
  const moodSuffix = input.recap.topMood ? ` • Top mood: ${input.recap.topMood}` : '';
  return `${titlePrefix} (${input.recap.dateRangeLabel}): ${input.recap.totalSteps.toLocaleString(
    'en-US'
  )} steps • ${input.recap.daysLit}/7 days lit${moodSuffix} — Keep your wick lit!`;
}

function drawRoundedCardFrame(
  bgHex: string,
  accentHex: string
): { surface: NonNullable<ReturnType<typeof Skia.Surface.MakeOffscreen>>; canvas: ReturnType<NonNullable<ReturnType<typeof Skia.Surface.MakeOffscreen>>['getCanvas']> } | null {
  const surface = Skia.Surface.MakeOffscreen(1080, 1350);
  if (!surface) {
    return null;
  }
  const canvas = surface.getCanvas();

  const bgPaint = Skia.Paint();
  bgPaint.setColor(Skia.Color(bgHex));
  canvas.drawRect(Skia.XYWHRect(0, 0, 1080, 1350), bgPaint);

  const cardPaint = Skia.Paint();
  cardPaint.setAntiAlias(true);
  cardPaint.setColor(Skia.Color('rgba(255,255,255,0.05)'));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(64, 64, 952, 1222), 44, 44), cardPaint);

  const borderPaint = Skia.Paint();
  borderPaint.setAntiAlias(true);
  borderPaint.setStyle(1); // Stroke
  borderPaint.setStrokeWidth(3);
  borderPaint.setColor(Skia.Color(accentHex));
  borderPaint.setAlphaf(0.38);
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(64, 64, 952, 1222), 44, 44), borderPaint);

  return { surface, canvas };
}

export function renderDailyCardDataUri(input: DailyShareCardInput): string | null {
  try {
    const ctx = drawRoundedCardFrame(input.theme.canvasTop, input.theme.accent);
    if (!ctx) {
      return null;
    }
    const { surface, canvas } = ctx;

    const titleFont = matchFont({ fontFamily: 'System', fontSize: 44, fontWeight: '700' });
    const heroFont = matchFont({ fontFamily: 'System', fontSize: 88, fontWeight: '700' });
    const subFont = matchFont({ fontFamily: 'System', fontSize: 34, fontWeight: '600' });
    const metaFont = matchFont({ fontFamily: 'System', fontSize: 28, fontWeight: '600' });

    const accentPaint = Skia.Paint();
    accentPaint.setAntiAlias(true);
    accentPaint.setColor(Skia.Color(input.theme.accent));

    const textPaint = Skia.Paint();
    textPaint.setAntiAlias(true);
    textPaint.setColor(Skia.Color(input.theme.primaryText));

    const mutedPaint = Skia.Paint();
    mutedPaint.setAntiAlias(true);
    mutedPaint.setColor(Skia.Color('#A1A1AA'));

    const headerLabel = (input.candleName?.trim() || 'WICK').toUpperCase();
    canvas.drawText(headerLabel, 120, 155, accentPaint, titleFont);
    canvas.drawText(`DAY ${input.streakDays} STREAK`, 120, 210, mutedPaint, metaFont);

    // Ambient flame glow + rendered candle centerpiece
    const lit = input.flameIntensity > 0;
    const glowPaint = Skia.Paint();
    glowPaint.setAntiAlias(true);
    glowPaint.setColor(Skia.Color(lit ? input.flameColorHex : '#71717A'));
    glowPaint.setAlphaf(lit ? Math.max(0.14, input.flameIntensity * 0.28) : 0.08);
    canvas.drawCircle(540, 460, 240, glowPaint);

    if (lit) {
      const outerFlame = Skia.Paint();
      outerFlame.setAntiAlias(true);
      outerFlame.setColor(Skia.Color(input.flameColorHex));
      canvas.drawOval(Skia.XYWHRect(475, 330, 130, 220), outerFlame);

      const coreFlame = Skia.Paint();
      coreFlame.setAntiAlias(true);
      coreFlame.setColor(Skia.Color('#FFFBEB'));
      canvas.drawOval(Skia.XYWHRect(508, 405, 64, 120), coreFlame);
    }

    const wickPaint = Skia.Paint();
    wickPaint.setColor(Skia.Color('#3F3F46'));
    canvas.drawRect(Skia.XYWHRect(533, 540, 14, 34), wickPaint);

    const waxPaint = Skia.Paint();
    waxPaint.setAntiAlias(true);
    waxPaint.setColor(Skia.Color('#F5EFE6'));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(410, 570, 260, 280), 28, 28), waxPaint);

    // Bottom stats & progress bar
    const stepsStr = `${input.stepsToday.toLocaleString('en-US')} steps`;
    canvas.drawText(stepsStr, 120, 975, textPaint, heroFont);

    const stateLabel = input.state.replace(/_/g, ' ');
    canvas.drawText(
      `${stateLabel}  •  Goal ${input.dailyStepGoal.toLocaleString('en-US')}  •  ${Math.round(input.waxGrams)}g wax`,
      120,
      1035,
      mutedPaint,
      subFont
    );

    const trackPaint = Skia.Paint();
    trackPaint.setAntiAlias(true);
    trackPaint.setColor(Skia.Color('rgba(255,255,255,0.12)'));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(120, 1085, 840, 26), 13, 13), trackPaint);

    const ratio = Math.max(0.03, Math.min(1, input.stepsToday / Math.max(1, input.dailyStepGoal)));
    canvas.drawRRect(
      Skia.RRectXY(Skia.XYWHRect(120, 1085, Math.round(840 * ratio), 26), 13, 13),
      accentPaint
    );

    canvas.drawText('WICK • KEEP YOUR FLAME LIT', 120, 1215, mutedPaint, metaFont);

    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    const base64 = snapshot.encodeToBase64(ImageFormat.PNG, 100);
    return base64 ? `data:image/png;base64,${base64}` : null;
  } catch {
    return null;
  }
}

export function renderWeeklyCardDataUri(input: WeeklyShareCardInput): string | null {
  try {
    const ctx = drawRoundedCardFrame(input.theme.canvasTop, input.theme.accent);
    if (!ctx) {
      return null;
    }
    const { surface, canvas } = ctx;

    const titleFont = matchFont({ fontFamily: 'System', fontSize: 44, fontWeight: '700' });
    const heroFont = matchFont({ fontFamily: 'System', fontSize: 82, fontWeight: '700' });
    const subFont = matchFont({ fontFamily: 'System', fontSize: 34, fontWeight: '600' });
    const metaFont = matchFont({ fontFamily: 'System', fontSize: 28, fontWeight: '600' });

    const accentPaint = Skia.Paint();
    accentPaint.setAntiAlias(true);
    accentPaint.setColor(Skia.Color(input.theme.accent));

    const textPaint = Skia.Paint();
    textPaint.setAntiAlias(true);
    textPaint.setColor(Skia.Color(input.theme.primaryText));

    const mutedPaint = Skia.Paint();
    mutedPaint.setAntiAlias(true);
    mutedPaint.setColor(Skia.Color('#A1A1AA'));

    const headerLabel = `${(input.candleName?.trim() || 'WICK').toUpperCase()} • WEEK IN WAX`;
    canvas.drawText(headerLabel, 120, 155, accentPaint, titleFont);
    canvas.drawText(input.recap.dateRangeLabel, 120, 210, mutedPaint, metaFont);

    canvas.drawText(
      `${input.recap.totalSteps.toLocaleString('en-US')} steps`,
      120,
      335,
      textPaint,
      heroFont
    );
    const moodPart = input.recap.topMood ? `  •  Top mood: ${input.recap.topMood}` : '';
    canvas.drawText(`${input.recap.daysLit} / 7 days lit${moodPart}`, 120, 395, mutedPaint, subFont);

    // 7-day stacked wax bands
    const startY = 470;
    const bandHeight = 76;
    const gap = 22;
    const bandPaint = Skia.Paint();
    bandPaint.setAntiAlias(true);

    input.recap.bands.slice(0, 7).forEach((band, idx) => {
      const y = startY + idx * (bandHeight + gap);
      bandPaint.setColor(Skia.Color(band.lit ? band.colorHex : '#27272A'));
      bandPaint.setAlphaf(band.lit ? 0.92 : 0.45);
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(120, y, 840, bandHeight), 20, 20), bandPaint);

      const labelPaint = Skia.Paint();
      labelPaint.setAntiAlias(true);
      labelPaint.setColor(Skia.Color(band.lit ? '#0A0A0C' : '#A1A1AA'));
      canvas.drawText(
        `${band.dateKey}   •   ${band.lit ? 'Lit' : 'Unlit'}`,
        152,
        y + 49,
        labelPaint,
        metaFont
      );
    });

    if (input.recap.topMood) {
      const dotPaint = Skia.Paint();
      dotPaint.setAntiAlias(true);
      dotPaint.setColor(Skia.Color(CANDLE_MOOD_COLORS[input.recap.topMood as CandleMood]));
      canvas.drawCircle(134, 1205, 12, dotPaint);
      canvas.drawText(`WICK • ${input.recap.topMood.toUpperCase()} WEEK`, 164, 1215, mutedPaint, metaFont);
    } else {
      canvas.drawText('WICK • KEEP YOUR FLAME LIT', 120, 1215, mutedPaint, metaFont);
    }

    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    const base64 = snapshot.encodeToBase64(ImageFormat.PNG, 100);
    return base64 ? `data:image/png;base64,${base64}` : null;
  } catch {
    return null;
  }
}

export function createDefaultShareCardDriver(): ShareCardDriver {
  return {
    renderDailyPngDataUri: renderDailyCardDataUri,
    renderWeeklyPngDataUri: renderWeeklyCardDataUri,
    openImageShare: async ({ title, message, dataUri, filename }) => {
      try {
        const res = await RNShare.open({
          title,
          message,
          url: dataUri,
          type: 'image/png',
          filename,
          failOnCancel: false,
        });
        return res?.dismissedAction ? 'dismissed' : 'shared';
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('did not share')) {
          return 'dismissed';
        }
        throw err;
      }
    },
    openTextShare: async (title, message) => {
      const res = await Share.share({ title, message });
      return res.action === Share.dismissedAction ? 'dismissed' : 'shared';
    },
  };
}

export class ShareCardService {
  constructor(private readonly driver: ShareCardDriver) {}

  async shareDailyCard(input: DailyShareCardInput): Promise<'shared' | 'dismissed'> {
    const title = 'My Wick Today';
    const message = formatDailyShareMessage(input);
    const dataUri = this.driver.renderDailyPngDataUri(input);
    if (dataUri) {
      try {
        return await this.driver.openImageShare({
          title,
          message,
          dataUri,
          filename: 'wick-today.png',
        });
      } catch {
        // Fallback to plain text share if native image sheet fails
      }
    }
    return this.driver.openTextShare(title, message);
  }

  async shareWeeklyCard(input: WeeklyShareCardInput): Promise<'shared' | 'dismissed'> {
    const titlePrefix = input.candleName?.trim() ? input.candleName.trim().toUpperCase() : 'WICK';
    const title = `${titlePrefix} • Week in Wax`;
    const message = formatWeeklyShareMessage(input);
    const dataUri = this.driver.renderWeeklyPngDataUri(input);
    if (dataUri) {
      try {
        return await this.driver.openImageShare({
          title,
          message,
          dataUri,
          filename: 'wick-week.png',
        });
      } catch {
        // Fallback to plain text share if native image sheet fails
      }
    }
    return this.driver.openTextShare(title, message);
  }
}
