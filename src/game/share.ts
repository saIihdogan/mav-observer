import type { SeasonResult } from '../engine';

/** UTC calendar date, so every player worldwide shares the same Daily board. */
export function todayUTC(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Spoiler-free, copyable Daily result card.
 * One emoji per 10-game stretch: 🟩 unbeaten, 🟨 one loss, 🟥 two or more.
 */
export function dailyShareText(date: string, result: SeasonResult, url = ''): string {
  const blocks: string[] = [];
  for (let i = 0; i < result.games.length; i += 10) {
    const losses = result.games.slice(i, i + 10).filter((g) => !g.win).length;
    blocks.push(losses === 0 ? '🟩' : losses === 1 ? '🟨' : '🟥');
  }
  const lines = [
    `HoopDraft 82-0 · Daily ${date}`,
    `${result.perfect ? '🏆' : '🏀'} ${result.wins}-${result.losses} · TR ${result.rating.total.toFixed(1)}`,
    blocks.join(''),
  ];
  if (url) lines.push(url);
  return lines.join('\n');
}
