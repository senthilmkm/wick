import { CandleSnapshot, WaxLayer } from '../types/wick';

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
  generatedDateKey: string
): string {
  const totalSteps = layers.reduce((sum, l) => sum + l.stepsAchieved, 0);
  const rows = layers
    .map(
      (layer) => `
      <tr>
        <td>${escapeHtml(layer.date)}</td>
        <td><span style="display:inline-block;width:12px;height:12px;border-radius:6px;background:${escapeHtml(layer.colorHex)};vertical-align:middle;margin-right:6px;"></span>${escapeHtml(layer.colorHex)}</td>
        <td>${layer.stepsAchieved.toLocaleString('en-US')} / ${layer.stepGoal.toLocaleString('en-US')}</td>
        <td>${layer.thicknessMm.toFixed(1)} mm</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0A0A0C; color: #F5F5F7; padding: 32px; }
    h1 { color: #FF9F43; margin-bottom: 4px; }
    .meta { color: #A1A1AA; font-size: 13px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #27272A; font-size: 13px; }
    th { color: #FF9F43; }
  </style>
</head>
<body>
  <h1>Wick — Wax Ledger Report</h1>
  <div class="meta">Generated ${escapeHtml(generatedDateKey)} • Current Streak: ${streakDays} days • Total Steps Logged: ${totalSteps.toLocaleString('en-US')}</div>
  <table>
    <thead>
      <tr><th>Date</th><th>Wax Band</th><th>Steps</th><th>Thickness</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
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
