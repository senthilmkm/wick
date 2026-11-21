import { deriveWaxLayerSpec } from '../engine/candleMath';
import { CandleMood, CandleSnapshot, WaxLayer } from '../types/wick';

export interface WaxLedgerPdfOptions {
  candleName?: string;
  waxGrams?: number;
  todaySteps?: number;
  dailyStepGoal?: number;
  todayMood?: CandleMood;
}

export interface ExportDriver {
  printToPdfFile(html: string): Promise<string>;
  renderCandleLoopMp4(snapshot: CandleSnapshot): Promise<string>;
  openNativeShareSheet(fileUri: string, message: string): Promise<void>;
}

/**
 * Escapes HTML special characters to prevent injection in PDF reports.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildWaxLedgerPdfHtml(
  layers: WaxLayer[],
  streakDays: number,
  generatedDateKey: string,
  options: WaxLedgerPdfOptions = {}
): string {
  const safeTodaySteps = Math.max(0, Math.round(options.todaySteps ?? 0));
  const safeGoal = Math.max(1, Math.round(options.dailyStepGoal ?? 8000));
  const todaySpec = deriveWaxLayerSpec(safeTodaySteps, safeGoal);
  const completedSteps = layers.reduce((sum, l) => sum + l.stepsAchieved, 0);
  const hasTodayInLayers = layers.some((l) => l.date === generatedDateKey);
  const includeTodayRow = !hasTodayInLayers && (safeTodaySteps > 0 || layers.length === 0);
  const totalSteps = completedSteps + (includeTodayRow ? safeTodaySteps : 0);
  const goalsMet =
    layers.filter((l) => l.stepsAchieved >= l.stepGoal).length +
    (includeTodayRow && safeTodaySteps >= safeGoal ? 1 : 0);
  const titleName = options.candleName?.trim()
    ? `${escapeHtml(options.candleName.trim())} — Wax Ledger Report`
    : 'Wick — Wax Ledger Report';
  const totalWaxLabel =
    options.waxGrams !== undefined ? `${Math.round(options.waxGrams).toLocaleString('en-US')} g` : `${layers.length} bands`;

  const todayRowHtml = includeTodayRow
    ? `
      <tr class="today-row">
        <td>${escapeHtml(generatedDateKey)} (Today)</td>
        <td>${options.todayMood ? escapeHtml(options.todayMood) : 'In Progress'}</td>
        <td><span class="swatch" style="background:${escapeHtml(todaySpec.colorHex)};"></span>${escapeHtml(todaySpec.colorHex)}</td>
        <td>${safeTodaySteps.toLocaleString('en-US')} / ${safeGoal.toLocaleString('en-US')} (${Math.min(100, Math.round((safeTodaySteps / safeGoal) * 100))}%)</td>
        <td>${todaySpec.thicknessMm.toFixed(1)} mm</td>
      </tr>`
    : '';

  const rows = [...layers]
    .reverse()
    .map(
      (layer) => `
      <tr>
        <td>${escapeHtml(layer.date)}</td>
        <td>${layer.mood ? escapeHtml(layer.mood) : '—'}</td>
        <td><span class="swatch" style="background:${escapeHtml(layer.colorHex)};"></span>${escapeHtml(layer.colorHex)}</td>
        <td>${layer.stepsAchieved.toLocaleString('en-US')} / ${layer.stepGoal.toLocaleString('en-US')} (${Math.min(100, Math.round((layer.stepsAchieved / Math.max(1, layer.stepGoal)) * 100))}%)</td>
        <td>${layer.thicknessMm.toFixed(1)} mm</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    @page { margin: 28px; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #FFFFFF; color: #18181B; padding: 28px; margin: 0; }
    h1 { color: #D97706; margin: 0 0 4px 0; font-size: 24px; }
    .meta { color: #52525B; font-size: 12px; margin-bottom: 18px; }
    .summary { display: flex; gap: 12px; margin-bottom: 20px; }
    .card { flex: 1; background: #F4F4F5; border: 1px solid #E4E4E7; border-radius: 10px; padding: 10px 12px; }
    .card-val { font-size: 16px; font-weight: 700; color: #18181B; }
    .card-lbl { font-size: 11px; color: #71717A; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid #E4E4E7; font-size: 12px; }
    th { color: #D97706; font-weight: 700; border-bottom: 2px solid #E4E4E7; }
    .today-row { background: #FFFBEB; font-weight: 600; }
    .swatch { display: inline-block; width: 11px; height: 11px; border-radius: 6px; vertical-align: middle; margin-right: 6px; border: 1px solid rgba(0,0,0,0.12); }
    .footer { margin-top: 24px; font-size: 11px; color: #71717A; text-align: center; }
  </style>
</head>
<body>
  <h1>${titleName}</h1>
  <div class="meta">Generated ${escapeHtml(generatedDateKey)} • Local-First Apple Health Step &amp; Wax History</div>
  <div class="summary">
    <div class="card"><div class="card-val">${streakDays}d</div><div class="card-lbl">Current Streak</div></div>
    <div class="card"><div class="card-val">${totalSteps.toLocaleString('en-US')}</div><div class="card-lbl">Total Steps</div></div>
    <div class="card"><div class="card-val">${goalsMet}</div><div class="card-lbl">Goals Met</div></div>
    <div class="card"><div class="card-val">${totalWaxLabel}</div><div class="card-lbl">Wax Earned</div></div>
  </div>
  <table>
    <thead>
      <tr><th>Date</th><th>Mood</th><th>Wax Band</th><th>Steps / Goal</th><th>Thickness</th></tr>
    </thead>
    <tbody>${todayRowHtml}${rows}</tbody>
  </table>
  <div class="footer">Wick • Keep your flame lit</div>
</body>
</html>`;
}

export class ExportService {
  constructor(private readonly driver: ExportDriver) {}

  async shareCandleVideo(snapshot: CandleSnapshot): Promise<string> {
    const mp4Uri = await this.driver.renderCandleLoopMp4(snapshot);
    const caption = `Day ${snapshot.streakDays} • My wick is ${snapshot.state.toLowerCase().replace('_', ' ')} (${snapshot.stepsToday.toLocaleString('en-US')} steps)`;
    await this.driver.openNativeShareSheet(mp4Uri, caption);
    return mp4Uri;
  }

  async shareWaxLedgerPdf(
    layers: WaxLayer[],
    streakDays: number,
    generatedDateKey: string
  ): Promise<string> {
    const html = buildWaxLedgerPdfHtml(layers, streakDays, generatedDateKey);
    const pdfUri = await this.driver.printToPdfFile(html);
    await this.driver.openNativeShareSheet(pdfUri, `Wick Wax Ledger (${streakDays}-day streak)`);
    return pdfUri;
  }
}
